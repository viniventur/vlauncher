//! O canal local por onde o `vl` (src/bin/vl.rs) fala com o launcher aberto: um named pipe do
//! Windows. Cada conexão traz um pedido (uma linha de JSON; ver src/protocolo.rs) e leva uma
//! resposta. Quem responde é a interface, que conhece os apps e as variações (src/lib/canal.ts): o
//! Rust leva o pedido até ela e devolve o que ela disser. Por aqui não se roda um comando qualquer: o
//! pedido traz o nome de um app e de uma variação já cadastrados, nunca uma linha de comando.
//!
//! Quem pode falar: o pipe recusa conexões de outras máquinas (o padrão do tokio), e a permissão
//! padrão de um pipe só deixa escrever nele o próprio usuário, o sistema e os administradores.

use crate::protocolo;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::net::windows::named_pipe::{NamedPipeServer, ServerOptions};
use tokio::sync::oneshot;
use tokio::time::timeout;

pub const EVENTO: &str = "canal:pedido";
/// Um pedido de verdade tem algumas centenas de bytes.
const MAIOR_PEDIDO: u64 = 64 * 1024;

/// Quanto esperar a interface responder. O `rodar` e o `reiniciar` esperam o app anunciar o endereço
/// (até 60 s, na interface); o `parar` espera os processos saírem; o resto é só ler.
fn espera_maxima(comando: &str) -> Duration {
    Duration::from_secs(match comando {
        "rodar" | "reiniciar" => 150,
        "parar" => 40,
        _ => 20,
    })
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Pedido {
    pub comando: String,
    #[serde(default)]
    pub args: Value,
    /// A pasta de onde o `vl` foi chamado: diz o app e a worktree quando o pedido não diz.
    #[serde(default)]
    pub pasta: Option<String>,
}

#[derive(Clone, Serialize)]
struct PedidoNumerado {
    id: u64,
    #[serde(flatten)]
    pedido: Pedido,
}

#[derive(Default)]
struct Estado {
    /// A interface já ouve os pedidos. Até ela carregar, eles esperam aqui.
    pronta: bool,
    pendentes: HashMap<u64, (PedidoNumerado, oneshot::Sender<Value>)>,
}

#[derive(Default)]
pub struct Canal(Mutex<Estado>);

/// Abre o canal e atende cada conexão à parte. Se o nome já estiver em uso (outro launcher aberto
/// com os mesmos dados), fica sem canal e avisa no console.
pub fn iniciar(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let nome = protocolo::nome_do_canal();
        let mut servidor = match ServerOptions::new().first_pipe_instance(true).create(&nome) {
            Ok(s) => s,
            Err(erro) => {
                eprintln!("o canal {nome} não abriu: {erro}");
                return;
            }
        };
        loop {
            let conectou = servidor.connect().await;
            // A próxima instância já fica esperando enquanto esta atende.
            let proximo = match ServerOptions::new().create(&nome) {
                Ok(s) => s,
                Err(erro) => {
                    eprintln!("o canal {nome} parou: {erro}");
                    return;
                }
            };
            let conexao = std::mem::replace(&mut servidor, proximo);
            if conectou.is_ok() {
                let app = app.clone();
                tauri::async_runtime::spawn(async move { atender(&app, conexao).await });
            }
        }
    });
}

async fn atender(app: &AppHandle, conexao: NamedPipeServer) {
    let (leitura, mut escrita) = tokio::io::split(conexao);
    let mut leitor = BufReader::new(leitura.take(MAIOR_PEDIDO));
    let mut linha = String::new();
    let resposta = match timeout(Duration::from_secs(10), leitor.read_line(&mut linha)).await {
        Ok(Ok(n)) if n > 0 => match serde_json::from_str::<Pedido>(&linha) {
            Ok(pedido) => encaminhar(app, pedido).await,
            Err(erro) => falha(format!("Pedido inválido: {erro}")),
        },
        _ => falha("O pedido não chegou inteiro."),
    };

    let mut texto = serde_json::to_string(&resposta).unwrap_or_else(|_| r#"{"ok":false}"#.into());
    texto.push('\n');
    if escrita.write_all(texto.as_bytes()).await.is_ok() {
        let _ = escrita.flush().await;
        // Espera o `vl` ler e fechar: fechando antes, a resposta ainda no pipe poderia se perder.
        let mut leitura = leitor.into_inner().into_inner();
        let mut resto = [0u8; 256];
        let _ = timeout(Duration::from_secs(10), async {
            while matches!(leitura.read(&mut resto).await, Ok(n) if n > 0) {}
        })
        .await;
    }
}

async fn encaminhar(app: &AppHandle, pedido: Pedido) -> Value {
    match pedido.comando.as_str() {
        // Sem a interface: o `vl` pergunta isto para saber se o launcher está aberto.
        "ping" => json!({
            "ok": true,
            "texto": format!("vlauncher {} aberto.", env!("CARGO_PKG_VERSION")),
            "dados": { "versao": env!("CARGO_PKG_VERSION") },
        }),
        _ => perguntar_a_interface(app, pedido).await,
    }
}

async fn perguntar_a_interface(app: &AppHandle, pedido: Pedido) -> Value {
    static PROXIMO: AtomicU64 = AtomicU64::new(1);
    let id = PROXIMO.fetch_add(1, Ordering::Relaxed);
    let espera = espera_maxima(&pedido.comando);
    let numerado = PedidoNumerado { id, pedido };
    let (tx, rx) = oneshot::channel();
    let canal = app.state::<Canal>();
    let pronta = {
        let mut estado = canal.0.lock().unwrap();
        estado.pendentes.insert(id, (numerado.clone(), tx));
        estado.pronta
    };
    if pronta {
        let _ = app.emit(EVENTO, &numerado);
    }
    match timeout(espera, rx).await {
        Ok(Ok(resposta)) => resposta,
        _ => {
            canal.0.lock().unwrap().pendentes.remove(&id);
            falha(format!(
                "O vlauncher não respondeu em {} s. Se a janela dele não abre, saia pela bandeja e abra de novo.",
                espera.as_secs()
            ))
        }
    }
}

fn falha(erro: impl Into<String>) -> Value {
    json!({ "ok": false, "erro": erro.into() })
}

/// A resposta da interface a um pedido.
#[tauri::command]
pub fn responder_canal(canal: State<'_, Canal>, id: u64, resposta: Value) {
    let pendente = canal.0.lock().unwrap().pendentes.remove(&id);
    if let Some((_, tx)) = pendente {
        let _ = tx.send(resposta);
    }
}

/// A interface carregou (ou recarregou): passa a ouvir, e recebe o que estava esperando. Num
/// recarregamento, o pedido que a página antiga atendia pela metade chega de novo (a interface
/// trata o repetido: o app que já roda não roda outra vez).
#[tauri::command]
pub fn canal_pronto(app: AppHandle, canal: State<'_, Canal>) {
    let pedidos: Vec<PedidoNumerado> = {
        let mut estado = canal.0.lock().unwrap();
        estado.pronta = true;
        estado.pendentes.values().map(|(p, _)| p.clone()).collect()
    };
    for pedido in pedidos {
        let _ = app.emit(EVENTO, &pedido);
    }
}
