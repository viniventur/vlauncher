//! As execuções: cada vez que um app roda numa pasta (a principal ou uma worktree) com uma
//! variação. O Rust é a fonte da verdade: guarda o processo, as últimas linhas da saída e o
//! endereço que o app anunciou, e avisa a interface por eventos. Se a interface recarregar, ela
//! pede tudo de novo com `listar_execucoes` e não perde nada.

use crate::sistema::{self, CREATE_NEW_PROCESS_GROUP, CREATE_NO_WINDOW};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::io::{BufRead, BufReader, Read};
use std::os::windows::process::CommandExt;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::{Arc, LazyLock, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;

/// Linhas guardadas por execução: o bastante para ler um erro de build sem pesar na memória.
const MAX_LINHAS: usize = 3000;
/// A saída vai para a interface em lotes, no máximo a cada 60 ms.
const INTERVALO_LOTE: Duration = Duration::from_millis(60);

pub const EVENTO_LINHAS: &str = "execucao:linhas";
pub const EVENTO_ESTADO: &str = "execucao:estado";

static URL_LOCAL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"https?://(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\])(?::\d+)?(?:/[^\s'"`)\]]*)?"#).unwrap()
});
static ANSI: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]").unwrap());

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pedido {
    pub app_id: String,
    pub variacao_id: Option<String>,
    /// O nome da variação ("dev:all"), para a lista de execuções.
    pub rotulo: String,
    /// A branch (ou a pasta, se a worktree estiver sem branch) em que roda.
    pub local: String,
    pub pasta: String,
    pub comando: String,
    #[serde(default)]
    pub env: Vec<(String, String)>,
    /// O endereço fixo da variação. Sem ele, vale o primeiro localhost que aparecer na saída.
    pub url: Option<String>,
    #[serde(default)]
    pub abrir_quando_pronto: bool,
    /// Quem pediu, quando não foi a interface: "vl" (a linha de comando, src/bin/vl.rs).
    #[serde(default)]
    pub origem: Option<String>,
}

#[derive(Clone, Copy, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Estado {
    Rodando,
    Parando,
    Encerrada,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Execucao {
    pub id: String,
    pub app_id: String,
    pub variacao_id: Option<String>,
    pub rotulo: String,
    pub local: String,
    pub pasta: String,
    pub comando: String,
    pub pid: u32,
    pub inicio: u64,
    pub fim: Option<u64>,
    pub codigo: Option<i32>,
    pub estado: Estado,
    /// Quem parou foi a pessoa: o código de saída (o do taskkill) não é erro do app.
    pub parada: bool,
    pub url: Option<String>,
    pub origem: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Linha {
    pub n: u64,
    pub texto: String,
    /// Veio do stderr.
    pub erro: bool,
}

#[derive(Clone, Serialize)]
struct LoteDeLinhas<'a> {
    id: &'a str,
    linhas: &'a [Linha],
}

struct Registro {
    execucao: Execucao,
    pedido: Pedido,
    linhas: VecDeque<Linha>,
    proxima: u64,
    /// O endereço veio de uma linha "Local:" (a do Vite), que vale mais que um localhost qualquer.
    url_forte: bool,
    url_fixa: bool,
    ja_abriu: bool,
    /// O processo ainda não saiu. Vale mesmo depois de o registro sair do mapa (reiniciar, descartar):
    /// só se mata a árvore de um processo vivo, porque o PID de um que já saiu pode ter ido para outro.
    vivo: Arc<AtomicBool>,
}

/// Um `docker compose up` preso ao terminal só para os contêineres com Ctrl+C, que um processo sem
/// console não recebe: matar o processo deixaria a stack no ar. Para ele, o launcher roda antes o
/// `docker compose ... stop` com as mesmas opções (os -f, o -p) e os mesmos serviços. Só o compose
/// sozinho na linha (sem &&, |, ;) e preso ao terminal (sem -d nem --wait).
pub fn parada_do_compose(comando: &str) -> Option<String> {
    static UP: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"(?i)^\s*((?:docker\s+compose|docker-compose)\b.*?)\s+up(?:\s+(.*))?$").unwrap());
    // As opções do up que levam um valor: o valor não é um serviço.
    const COM_VALOR: [&str; 8] = ["-t", "--timeout", "--scale", "--exit-code-from", "--attach", "--no-attach", "--pull", "--wait-timeout"];
    if comando.contains(['&', '|', ';', '<', '>', '\n']) {
        return None;
    }
    let partes = UP.captures(comando)?;
    let mut parada = format!("{} stop", partes.get(1)?.as_str().trim());
    let mut pular = false;
    for palavra in partes.get(2).map(|m| m.as_str()).unwrap_or_default().split_whitespace() {
        if std::mem::take(&mut pular) {
            continue;
        }
        if matches!(palavra, "-d" | "--detach" | "--wait") || palavra.starts_with("--detach=") {
            return None;
        }
        if COM_VALOR.contains(&palavra) {
            pular = true;
        } else if !palavra.starts_with('-') {
            parada.push(' ');
            parada.push_str(palavra);
        }
    }
    Some(parada)
}

/// Roda um comando curto na pasta, sem janela, e espera até `limite` (depois, desiste dele).
fn rodar_e_esperar(comando: &str, pasta: &str, env: &[(String, String)], limite: Duration) {
    let mut cmd = Command::new("cmd");
    cmd.raw_arg(format!("/D /S /C \"{comando}\""))
        .current_dir(pasta)
        .envs(env.iter().filter(|(k, _)| !k.trim().is_empty()).map(|(k, v)| (k.trim(), v)))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW);
    let Ok(mut filho) = cmd.spawn() else { return };
    let inicio = Instant::now();
    while inicio.elapsed() < limite {
        if !matches!(filho.try_wait(), Ok(None)) {
            return;
        }
        thread::sleep(Duration::from_millis(200));
    }
    let _ = filho.kill();
}

/// Para uma execução de vez. Bloqueia (o compose leva alguns segundos para parar os contêineres): chame
/// fora da thread da interface.
fn parar_de_vez(pid: u32, pedido: &Pedido, vivo: &AtomicBool) {
    if let Some(parada) = parada_do_compose(&pedido.comando) {
        rodar_e_esperar(&parada, &pedido.pasta, &pedido.env, Duration::from_secs(90));
    }
    // Parados os contêineres, o `up` costuma sair sozinho: só se mata o que ainda estiver de pé.
    if vivo.load(Ordering::SeqCst) {
        sistema::matar_arvore(pid);
    }
}

#[derive(Default)]
pub struct Execucoes(Mutex<HashMap<String, Registro>>);

fn agora() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn novo_id() -> String {
    static CONTADOR: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
    let n = CONTADOR.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    format!("{:x}-{n}", agora())
}

/// Tira as cores do terminal e, numa linha de progresso reescrita com \r, fica com o último quadro.
pub fn limpar_linha(bruta: &str) -> String {
    let sem_fim = bruta.trim_end_matches(['\r', '\n']);
    let ultimo_quadro = sem_fim.rsplit('\r').next().unwrap_or(sem_fim);
    ANSI.replace_all(ultimo_quadro, "").into_owned()
}

/// O endereço local que a linha anuncia, com 0.0.0.0 e [::] trocados por localhost (que abrem no
/// navegador). Devolve também se a linha é a "Local:" do Vite.
pub fn url_na_linha(linha: &str) -> Option<(String, bool)> {
    let achada = URL_LOCAL.find(linha)?.as_str();
    let url = achada
        .replacen("0.0.0.0", "localhost", 1)
        .replacen("[::1]", "localhost", 1)
        .replacen("[::]", "localhost", 1)
        .trim_end_matches(['.', ',', ';'])
        .to_string();
    let forte = linha.to_lowercase().contains("local:");
    Some((url, forte))
}

fn emitir_estado(app: &AppHandle, execucao: &Execucao) {
    let _ = app.emit(EVENTO_ESTADO, execucao);
    crate::janela::atualizar_bandeja(app);
}

fn iniciar(app: &AppHandle, pedido: Pedido) -> Result<Execucao, String> {
    if !std::path::Path::new(&pedido.pasta).is_dir() {
        return Err(format!("A pasta {} não existe.", pedido.pasta));
    }

    // cmd /S /C "...": o cmd tira só as aspas de fora e roda o resto como está. O chcp deixa as
    // mensagens do próprio cmd em UTF-8.
    let mut cmd = Command::new("cmd");
    cmd.raw_arg(format!("/D /S /C \"chcp 65001>nul & {}\"", pedido.comando))
        .current_dir(&pedido.pasta)
        .envs(pedido.env.iter().filter(|(k, _)| !k.trim().is_empty()).map(|(k, v)| (k.trim(), v)))
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP);

    let mut filho = cmd.spawn().map_err(|e| format!("Não consegui iniciar: {e}"))?;
    let saida = filho.stdout.take();
    let erros = filho.stderr.take();

    let url_fixa = pedido.url.as_deref().is_some_and(|u| !u.trim().is_empty());
    let execucao = Execucao {
        id: novo_id(),
        app_id: pedido.app_id.clone(),
        variacao_id: pedido.variacao_id.clone(),
        rotulo: pedido.rotulo.clone(),
        local: pedido.local.clone(),
        pasta: pedido.pasta.clone(),
        comando: pedido.comando.clone(),
        pid: filho.id(),
        inicio: agora(),
        fim: None,
        codigo: None,
        estado: Estado::Rodando,
        parada: false,
        url: if url_fixa { pedido.url.clone() } else { None },
        origem: pedido.origem.clone(),
    };
    let id = execucao.id.clone();
    let vivo = Arc::new(AtomicBool::new(true));

    app.state::<Execucoes>().0.lock().unwrap().insert(
        id.clone(),
        Registro {
            execucao: execucao.clone(),
            pedido,
            linhas: VecDeque::new(),
            proxima: 0,
            url_forte: false,
            url_fixa,
            ja_abriu: false,
            vivo: vivo.clone(),
        },
    );
    emitir_estado(app, &execucao);

    // Duas leituras (stdout e stderr) mandam as linhas para um canal; outra thread junta em lotes.
    let (tx, rx) = mpsc::channel::<(bool, String)>();
    if let Some(s) = saida {
        ler(s, false, tx.clone());
    }
    if let Some(e) = erros {
        ler(e, true, tx.clone());
    }
    drop(tx);

    {
        let app = app.clone();
        let id = id.clone();
        thread::spawn(move || {
            let mut lote = Vec::new();
            let mut ultimo = Instant::now();
            loop {
                match rx.recv_timeout(INTERVALO_LOTE) {
                    Ok(item) => {
                        lote.push(item);
                        if ultimo.elapsed() >= INTERVALO_LOTE {
                            registrar_lote(&app, &id, std::mem::take(&mut lote));
                            ultimo = Instant::now();
                        }
                    }
                    Err(RecvTimeoutError::Timeout) => {
                        if !lote.is_empty() {
                            registrar_lote(&app, &id, std::mem::take(&mut lote));
                        }
                        ultimo = Instant::now();
                    }
                    Err(RecvTimeoutError::Disconnected) => {
                        registrar_lote(&app, &id, lote);
                        break;
                    }
                }
            }
        });
    }

    {
        let app = app.clone();
        thread::spawn(move || {
            let codigo = filho.wait().ok().and_then(|s| s.code());
            vivo.store(false, Ordering::SeqCst);
            let estado = app.state::<Execucoes>();
            let mut mapa = estado.0.lock().unwrap();
            // Reiniciada ou descartada: o registro já não é desta execução.
            if let Some(r) = mapa.get_mut(&id) {
                r.execucao.estado = Estado::Encerrada;
                r.execucao.fim = Some(agora());
                r.execucao.codigo = codigo;
                let copia = r.execucao.clone();
                drop(mapa);
                emitir_estado(&app, &copia);
            }
        });
    }

    Ok(execucao)
}

fn ler(fluxo: impl Read + Send + 'static, erro: bool, tx: mpsc::Sender<(bool, String)>) {
    thread::spawn(move || {
        let mut leitor = BufReader::new(fluxo);
        let mut buffer = Vec::new();
        loop {
            buffer.clear();
            match leitor.read_until(b'\n', &mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(_) => {
                    let texto = limpar_linha(&String::from_utf8_lossy(&buffer));
                    if tx.send((erro, texto)).is_err() {
                        break;
                    }
                }
            }
        }
    });
}

fn registrar_lote(app: &AppHandle, id: &str, lote: Vec<(bool, String)>) {
    if lote.is_empty() {
        return;
    }
    let estado = app.state::<Execucoes>();
    let mut mapa = estado.0.lock().unwrap();
    let Some(r) = mapa.get_mut(id) else { return };

    let mut novas = Vec::with_capacity(lote.len());
    let mut url_mudou = false;
    let mut abrir: Option<String> = None;
    for (erro, texto) in lote {
        if let Some((url, forte)) = url_na_linha(&texto) {
            if !r.url_fixa && (r.execucao.url.is_none() || (forte && !r.url_forte)) {
                r.execucao.url = Some(url);
                r.url_forte = forte;
                url_mudou = true;
            }
            // Pronto: o app anunciou um endereço. Abre uma vez só: o fixo, se a variação tiver, na
            // primeira URL da saída; sem ele, só na linha "Local:" (no dev:all, a API costuma falar
            // primeiro, e não é ela que se quer abrir).
            if r.pedido.abrir_quando_pronto && !r.ja_abriu && (r.url_fixa || forte) {
                r.ja_abriu = true;
                abrir = r.execucao.url.clone();
            }
        }
        let linha = Linha { n: r.proxima, texto, erro };
        r.proxima += 1;
        r.linhas.push_back(linha.clone());
        novas.push(linha);
    }
    while r.linhas.len() > MAX_LINHAS {
        r.linhas.pop_front();
    }
    let execucao = url_mudou.then(|| r.execucao.clone());
    drop(mapa);

    let _ = app.emit(EVENTO_LINHAS, LoteDeLinhas { id, linhas: &novas });
    if let Some(e) = execucao {
        emitir_estado(app, &e);
    }
    if let Some(url) = abrir {
        let _ = app.opener().open_url(url, None::<&str>);
    }
}

/// Quantas execuções ainda estão rodando (para a bandeja e para o fechar da janela).
pub fn rodando(app: &AppHandle) -> usize {
    let estado = app.state::<Execucoes>();
    let mapa = estado.0.lock().unwrap();
    mapa.values().filter(|r| r.execucao.estado != Estado::Encerrada).count()
}

/// O processo de cada execução que ainda não encerrou (o monitor mede a árvore dele).
pub fn raizes_rodando(app: &AppHandle) -> Vec<(String, u32)> {
    let estado = app.state::<Execucoes>();
    let mapa = estado.0.lock().unwrap();
    mapa.values()
        .filter(|r| r.execucao.estado != Estado::Encerrada)
        .map(|r| (r.execucao.id.clone(), r.execucao.pid))
        .collect()
}

/// O que está rodando, uma linha por execução ("• loja-online · dev:all (main)"), para a
/// confirmação do parar todas da bandeja. O Rust não sabe o nome do app: usa o da pasta.
pub fn resumo_das_rodando(app: &AppHandle) -> Vec<String> {
    let estado = app.state::<Execucoes>();
    let mapa = estado.0.lock().unwrap();
    let mut rodando: Vec<&Execucao> = mapa.values().map(|r| &r.execucao).filter(|e| e.estado == Estado::Rodando).collect();
    rodando.sort_by_key(|e| e.inicio);
    rodando
        .iter()
        .map(|e| {
            let pasta = std::path::Path::new(&e.pasta).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            format!("• {pasta} · {} ({})", e.rotulo, e.local)
        })
        .collect()
}

/// Ao sair do launcher, nenhum servidor fica para trás ocupando porta, nem contêiner de pé: param todas
/// juntas, e a saída espera até 30 s pelos composes.
pub fn encerrar_todas(app: &AppHandle) {
    let ativas: Vec<(u32, Pedido, Arc<AtomicBool>)> = {
        let estado = app.state::<Execucoes>();
        let mapa = estado.0.lock().unwrap();
        mapa.values()
            .filter(|r| r.execucao.estado != Estado::Encerrada)
            .map(|r| (r.execucao.pid, r.pedido.clone(), r.vivo.clone()))
            .collect()
    };
    let quantas = ativas.len();
    let (tx, rx) = mpsc::channel();
    for (pid, pedido, vivo) in ativas {
        let tx = tx.clone();
        thread::spawn(move || {
            parar_de_vez(pid, &pedido, &vivo);
            let _ = tx.send(());
        });
    }
    let limite = Instant::now() + Duration::from_secs(30);
    for _ in 0..quantas {
        if rx.recv_timeout(limite.saturating_duration_since(Instant::now())).is_err() {
            break;
        }
    }
}

/// Se alguma execução roda nesta pasta (para não trocar a branch debaixo dela).
pub fn rodando_na_pasta(app: &AppHandle, pasta: &str) -> bool {
    let alvo = crate::git::normalizar(pasta).to_lowercase();
    let estado = app.state::<Execucoes>();
    let mapa = estado.0.lock().unwrap();
    mapa.values().any(|r| {
        r.execucao.estado != Estado::Encerrada && crate::git::normalizar(&r.execucao.pasta).to_lowercase() == alvo
    })
}

#[tauri::command]
pub fn iniciar_execucao(app: AppHandle, pedido: Pedido) -> Result<Execucao, String> {
    iniciar(&app, pedido)
}

#[tauri::command]
pub fn parar_execucao(app: AppHandle, estado: State<'_, Execucoes>, id: String) -> Result<(), String> {
    let (copia, pid, pedido, vivo) = {
        let mut mapa = estado.0.lock().unwrap();
        let r = mapa.get_mut(&id).ok_or("Execução não encontrada.")?;
        if r.execucao.estado == Estado::Encerrada {
            return Ok(());
        }
        r.execucao.estado = Estado::Parando;
        r.execucao.parada = true;
        (r.execucao.clone(), r.execucao.pid, r.pedido.clone(), r.vivo.clone())
    };
    emitir_estado(&app, &copia);
    thread::spawn(move || parar_de_vez(pid, &pedido, &vivo));
    Ok(())
}

/// Para tudo o que está rodando (o botão do topo, a busca e a bandeja). Cada uma fica "parada pela
/// pessoa", como no parar de uma por uma. Devolve quantas parou.
#[tauri::command]
pub fn parar_todas(app: AppHandle) -> usize {
    let paradas: Vec<(Execucao, Pedido, Arc<AtomicBool>)> = {
        let estado = app.state::<Execucoes>();
        let mut mapa = estado.0.lock().unwrap();
        mapa.values_mut()
            .filter(|r| r.execucao.estado == Estado::Rodando)
            .map(|r| {
                r.execucao.estado = Estado::Parando;
                r.execucao.parada = true;
                (r.execucao.clone(), r.pedido.clone(), r.vivo.clone())
            })
            .collect()
    };
    let quantas = paradas.len();
    for (copia, pedido, vivo) in paradas {
        emitir_estado(&app, &copia);
        thread::spawn(move || parar_de_vez(copia.pid, &pedido, &vivo));
    }
    quantas
}

/// Para e roda de novo com o mesmo pedido. A execução nova entra no lugar da antiga. Assíncrono: um
/// compose leva alguns segundos para parar os contêineres, e a interface não pode travar esperando.
#[tauri::command]
pub async fn reiniciar_execucao(app: AppHandle, id: String) -> Result<Execucao, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut registro = app.state::<Execucoes>().0.lock().unwrap().remove(&id).ok_or("Execução não encontrada.")?;
        if registro.execucao.estado != Estado::Encerrada {
            registro.execucao.estado = Estado::Parando;
            emitir_estado(&app, &registro.execucao);
            parar_de_vez(registro.execucao.pid, &registro.pedido, &registro.vivo);
        }
        let _ = app.emit("execucao:removida", &id);
        iniciar(&app, registro.pedido)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn descartar_execucao(app: AppHandle, estado: State<'_, Execucoes>, id: String) -> Result<(), String> {
    let registro = estado.0.lock().unwrap().remove(&id);
    if let Some(r) = registro {
        if r.execucao.estado != Estado::Encerrada {
            thread::spawn(move || parar_de_vez(r.execucao.pid, &r.pedido, &r.vivo));
        }
        let _ = app.emit("execucao:removida", &id);
        crate::janela::atualizar_bandeja(&app);
    }
    Ok(())
}

#[tauri::command]
pub fn listar_execucoes(estado: State<'_, Execucoes>) -> Vec<Execucao> {
    let mapa = estado.0.lock().unwrap();
    let mut lista: Vec<Execucao> = mapa.values().map(|r| r.execucao.clone()).collect();
    lista.sort_by_key(|e| e.inicio);
    lista
}

#[tauri::command]
pub fn linhas_da_execucao(estado: State<'_, Execucoes>, id: String) -> Vec<Linha> {
    let mapa = estado.0.lock().unwrap();
    mapa.get(&id).map(|r| r.linhas.iter().cloned().collect()).unwrap_or_default()
}

#[tauri::command]
pub fn limpar_linhas(estado: State<'_, Execucoes>, id: String) {
    if let Some(r) = estado.0.lock().unwrap().get_mut(&id) {
        r.linhas.clear();
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn o_compose_preso_ao_terminal_para_os_conteineres_antes() {
        let parada = |c: &str| parada_do_compose(c);
        assert_eq!(parada("docker compose up --build").as_deref(), Some("docker compose stop"));
        assert_eq!(
            parada("docker compose -f docker-compose.dev.yml -p loja up --build").as_deref(),
            Some("docker compose -f docker-compose.dev.yml -p loja stop")
        );
        // Só os serviços do up, sem tomar o valor de uma opção por serviço.
        assert_eq!(parada("docker compose up --build -t 5 --scale api=2 db redis").as_deref(), Some("docker compose stop db redis"));
        assert_eq!(parada("docker-compose up").as_deref(), Some("docker-compose stop"));
        assert_eq!(parada("  DOCKER COMPOSE up").as_deref(), Some("DOCKER COMPOSE stop"));
        // Solto do terminal, numa linha com mais coisas ou sem up: nada a fazer.
        for c in [
            "docker compose up -d",
            "docker compose up --detach db",
            "docker compose up -d --build --wait",
            "docker compose up -d db redis && cd backend && pnpm dev",
            "docker compose logs -f",
            "npm run dev",
            "docker compose -f backup.yml pull",
        ] {
            assert_eq!(parada(c), None, "{c}");
        }
    }

    #[test]
    fn tira_cores_e_quadros_de_progresso() {
        assert_eq!(limpar_linha("\x1b[32m  VITE\x1b[39m pronto\r\n"), "  VITE pronto");
        assert_eq!(limpar_linha("10%\r50%\r100%\n"), "100%");
    }

    #[test]
    fn acha_o_endereco_local() {
        assert_eq!(
            url_na_linha("  ➜  Local:   http://localhost:8080/"),
            Some(("http://localhost:8080/".into(), true))
        );
        assert_eq!(
            url_na_linha("[api] Servidor em http://0.0.0.0:3001."),
            Some(("http://localhost:3001".into(), false))
        );
        assert_eq!(url_na_linha("  ➜  Network: http://[::1]:5173/"), Some(("http://localhost:5173/".into(), false)));
        assert_eq!(url_na_linha("buscando https://registry.npmjs.org/react"), None);
    }
}
