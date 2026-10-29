//! O `vl`: o vlauncher na linha de comando. Fala com o launcher aberto pelo canal local
//! (src/canal.rs) e escreve a resposta. Feito para o terminal e para o Claude Code: o app que um
//! agente sobe por aqui aparece rodando no launcher, com a saída, a CPU e a memória, em vez de ficar
//! escondido no shell dele. Só roda o que já está no launcher (o app e a variação, pelo nome).

#[path = "../protocolo.rs"]
mod protocolo;

use serde_json::{json, Value};
use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::os::windows::io::AsRawHandle;
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::{Command, ExitCode, Stdio};
use std::thread;
use std::time::{Duration, Instant};
use windows_sys::Win32::Foundation::{SetHandleInformation, HANDLE_FLAG_INHERIT};

const AJUDA: &str = "\
vl: o vlauncher na linha de comando

  vl status                 o que está rodando: endereço, CPU, memória e portas
  vl apps                   os apps e os subgrupos do launcher, com as variações
  vl rodar [app]            roda a variação padrão e espera o app anunciar o endereço
  vl parar [app]            para o app (vl parar --todas: tudo o que está rodando)
  vl reiniciar [app]        para e roda de novo
  vl saida [app]            as últimas linhas da saída
  vl abrir [app]            traz o launcher, com o painel do app aberto
  vl instalar-skill         ensina o Claude Code a usar o vl (a skill vlauncher)

Sem o nome do app, vale o da pasta atual (e a worktree em que ela está). O nome pode
ser só um pedaço, sem acento: vl rodar loja. O nome de um subgrupo vale para todos os
apps dele: o rodar sobe cada um com a variação escolhida no subgrupo.

Opções:
  -v, --variacao <nome>     outra variação (dev:all, preview...)
      --local <branch>      roda na worktree dessa branch
      --sem-esperar         rodar e reiniciar voltam logo, sem esperar o endereço
  -n, --linhas <n>          saida: quantas linhas (padrão: 60)
      --todas               parar: tudo o que está rodando
      --json                a resposta em JSON
      --em <pasta>          instalar-skill: a pasta de configuração do Claude Code
                            (padrão: CLAUDE_CONFIG_DIR ou ~/.claude)
";

/// A skill do Claude Code (claude-code/vlauncher/SKILL.md), que o `vl instalar-skill` grava.
const SKILL: &str = include_str!("../../../claude-code/vlauncher/SKILL.md");
/// Na skill, o caminho do `vl` instalado no lugar de sempre; o `instalar-skill` põe o de verdade.
const CAMINHO_PADRAO: &str = "$LOCALAPPDATA/vlauncher/vl.exe";

const ERROR_FILE_NOT_FOUND: i32 = 2;
const ERROR_PIPE_BUSY: i32 = 231;
const DETACHED_PROCESS: u32 = 0x0000_0008;
const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;

/// Saídas: 0 deu certo; 1 o launcher respondeu que não deu; 2 não deu para falar com ele; 64 uso errado.
const ERRO_DO_LAUNCHER: u8 = 1;
const SEM_LAUNCHER: u8 = 2;
const USO_ERRADO: u8 = 64;

#[derive(Default, Debug, PartialEq)]
struct Opcoes {
    comando: String,
    app: Vec<String>,
    variacao: Option<String>,
    local: Option<String>,
    linhas: Option<u32>,
    todas: bool,
    json: bool,
    sem_esperar: bool,
    em: Option<String>,
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let opcoes = match ler_opcoes(&args) {
        Ok(o) => o,
        Err(erro) => {
            eprintln!("{erro}\n\n{AJUDA}");
            return ExitCode::from(USO_ERRADO);
        }
    };
    match opcoes.comando.as_str() {
        "" | "ajuda" => {
            print!("{AJUDA}");
            ExitCode::SUCCESS
        }
        "versao" => {
            println!("vl {}", env!("CARGO_PKG_VERSION"));
            ExitCode::SUCCESS
        }
        "instalar-skill" => match instalar_skill(opcoes.em.as_deref()) {
            Ok(texto) => {
                println!("{texto}");
                ExitCode::SUCCESS
            }
            Err(erro) => {
                eprintln!("{erro}");
                ExitCode::from(ERRO_DO_LAUNCHER)
            }
        },
        _ => conversar(&opcoes),
    }
}

/// O comando no nome de sempre: aceita os apelidos em inglês e as palavras com acento.
fn comando_canonico(palavra: &str) -> Option<&'static str> {
    Some(match palavra.to_lowercase().as_str() {
        "ajuda" | "help" => "ajuda",
        "versao" | "versão" | "version" => "versao",
        "status" | "st" | "ps" => "status",
        "apps" | "lista" | "listar" | "ls" | "list" => "apps",
        "rodar" | "run" | "start" | "iniciar" | "subir" => "rodar",
        "parar" | "stop" => "parar",
        "reiniciar" | "restart" => "reiniciar",
        "saida" | "saída" | "logs" | "log" => "saida",
        "abrir" | "open" | "mostrar" => "abrir",
        "instalar-skill" => "instalar-skill",
        _ => return None,
    })
}

fn ler_opcoes(brutos: &[String]) -> Result<Opcoes, String> {
    // --opcao=valor vira --opcao valor.
    let args: Vec<String> = brutos
        .iter()
        .flat_map(|a| match a.split_once('=') {
            Some((nome, valor)) if a.starts_with("--") => vec![nome.to_string(), valor.to_string()],
            _ => vec![a.clone()],
        })
        .collect();
    let mut o = Opcoes::default();
    let mut i = 0;
    let valor = |i: &mut usize, nome: &str| -> Result<String, String> {
        *i += 1;
        args.get(*i).cloned().ok_or_else(|| format!("{nome} precisa de um valor."))
    };
    while i < args.len() {
        let a = args[i].as_str();
        match a {
            "-v" | "--variacao" | "--variação" => o.variacao = Some(valor(&mut i, a)?),
            "--local" | "--branch" => o.local = Some(valor(&mut i, a)?),
            "-n" | "--linhas" => {
                let n = valor(&mut i, a)?;
                o.linhas = Some(n.parse().map_err(|_| format!("{a} precisa de um número, não \"{n}\"."))?);
            }
            "--todas" | "--todos" => o.todas = true,
            "--json" => o.json = true,
            "--sem-esperar" => o.sem_esperar = true,
            "--em" => o.em = Some(valor(&mut i, a)?),
            "-h" | "--help" | "--ajuda" => o.comando = "ajuda".into(),
            "-V" | "--version" | "--versao" => o.comando = "versao".into(),
            _ if a.starts_with('-') && a.len() > 1 => return Err(format!("Opção desconhecida: {a}")),
            _ if o.comando.is_empty() => {
                o.comando = comando_canonico(a).ok_or_else(|| format!("Comando desconhecido: {a}"))?.to_string()
            }
            _ => o.app.push(a.to_string()),
        }
        i += 1;
    }
    Ok(o)
}

fn conversar(o: &Opcoes) -> ExitCode {
    let pasta = std::env::current_dir().ok().map(|p| p.to_string_lossy().into_owned());
    let mut args = json!({});
    let campos = [
        ("app", (!o.app.is_empty()).then(|| json!(o.app.join(" ")))),
        ("variacao", o.variacao.as_ref().map(|v| json!(v))),
        ("local", o.local.as_ref().map(|v| json!(v))),
        ("linhas", o.linhas.map(|n| json!(n))),
        ("todas", o.todas.then_some(json!(true))),
        ("esperar", Some(json!(!o.sem_esperar))),
    ];
    for (nome, valor) in campos {
        if let Some(v) = valor {
            args[nome] = v;
        }
    }
    let pedido = json!({ "comando": o.comando, "args": args, "pasta": pasta });

    let canal = match conectar() {
        Ok(Some(canal)) => canal,
        Ok(None) => match o.comando.as_str() {
            // Com o launcher fechado, não há nada rodando por ele.
            "status" | "parar" => {
                let texto = "O vlauncher está fechado: nada rodando por ele.";
                if o.json {
                    println!("{}", json!({ "ok": true, "texto": texto, "dados": { "execucoes": [] } }));
                } else {
                    println!("{texto}");
                }
                return ExitCode::SUCCESS;
            }
            "rodar" | "reiniciar" | "abrir" => match abrir_o_launcher(o.comando != "abrir") {
                Ok(canal) => canal,
                Err(erro) => return falhar(&erro, SEM_LAUNCHER),
            },
            _ => return falhar("O vlauncher está fechado. Abra-o (o vl rodar também o abre).", SEM_LAUNCHER),
        },
        Err(erro) => return falhar(&erro, SEM_LAUNCHER),
    };

    let resposta = match perguntar(canal, &pedido) {
        Ok(r) => r,
        Err(erro) => return falhar(&erro, SEM_LAUNCHER),
    };
    let ok = resposta["ok"].as_bool().unwrap_or(false);
    if o.json {
        println!("{}", serde_json::to_string_pretty(&resposta).unwrap_or_default());
    } else {
        if let Some(erro) = resposta["erro"].as_str() {
            eprintln!("{erro}");
        }
        if let Some(texto) = resposta["texto"].as_str() {
            println!("{texto}");
        }
    }
    if ok {
        ExitCode::SUCCESS
    } else {
        ExitCode::from(ERRO_DO_LAUNCHER)
    }
}

fn falhar(erro: &str, codigo: u8) -> ExitCode {
    eprintln!("{erro}");
    ExitCode::from(codigo)
}

/// O canal do launcher aberto; None se ele estiver fechado.
fn conectar() -> Result<Option<File>, String> {
    let nome = protocolo::nome_do_canal();
    let inicio = Instant::now();
    loop {
        match OpenOptions::new().read(true).write(true).open(&nome) {
            Ok(canal) => return Ok(Some(canal)),
            Err(e) if e.raw_os_error() == Some(ERROR_FILE_NOT_FOUND) => return Ok(None),
            // Todas as instâncias ocupadas: outra conversa está terminando.
            Err(e) if e.raw_os_error() == Some(ERROR_PIPE_BUSY) && inicio.elapsed() < Duration::from_secs(10) => {
                thread::sleep(Duration::from_millis(50))
            }
            Err(e) => return Err(format!("Não consegui falar com o vlauncher: {e}")),
        }
    }
}

fn perguntar(mut canal: File, pedido: &Value) -> Result<Value, String> {
    let mut linha = pedido.to_string();
    linha.push('\n');
    canal.write_all(linha.as_bytes()).map_err(|e| format!("Não consegui mandar o pedido ao vlauncher: {e}"))?;
    let mut resposta = String::new();
    BufReader::new(&canal)
        .read_line(&mut resposta)
        .map_err(|e| format!("O vlauncher não respondeu: {e}"))?;
    serde_json::from_str(&resposta).map_err(|_| "O vlauncher respondeu algo que não entendi.".to_string())
}

/// Abre o launcher (o vlauncher.exe ao lado do vl.exe) e espera o canal aparecer. Pedido pelo
/// terminal, ele começa na bandeja, sem roubar o foco.
fn abrir_o_launcher(na_bandeja: bool) -> Result<File, String> {
    let pasta = std::env::current_exe().map_err(|e| e.to_string())?.parent().map(PathBuf::from).unwrap_or_default();
    let exe = pasta.join("vlauncher.exe");
    if !exe.is_file() {
        return Err(format!("O vlauncher está fechado, e não o achei em {}.", exe.display()));
    }
    // Herdando a saída deste terminal, o launcher a seguraria aberta enquanto vivesse, e quem
    // chamou o vl (o Claude Code, um script) ficaria esperando ela fechar.
    for fluxo in [std::io::stdin().as_raw_handle(), std::io::stdout().as_raw_handle(), std::io::stderr().as_raw_handle()] {
        // SAFETY: só tira a marca de herança de um handle deste processo; um handle inválido só falha.
        unsafe { SetHandleInformation(fluxo, HANDLE_FLAG_INHERIT, 0) };
    }
    let mut launcher = Command::new(&exe);
    if na_bandeja {
        launcher.arg("--na-bandeja");
    }
    // A pasta do launcher, não a do terminal: aberto numa worktree, ele a prenderia (o Windows não
    // apaga a pasta em que um processo está).
    launcher
        .current_dir(&pasta)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP)
        .spawn()
        .map_err(|e| format!("Não consegui abrir o vlauncher: {e}"))?;

    let inicio = Instant::now();
    while inicio.elapsed() < Duration::from_secs(30) {
        thread::sleep(Duration::from_millis(200));
        if let Some(canal) = conectar()? {
            return Ok(canal);
        }
    }
    Err("Abri o vlauncher, mas ele não respondeu em 30 s.".into())
}

/// Grava a skill vlauncher em <pasta do Claude Code>/skills/vlauncher/SKILL.md, com o caminho deste vl.
fn instalar_skill(em: Option<&str>) -> Result<String, String> {
    let casa = std::env::var_os("USERPROFILE").map(PathBuf::from);
    let base = match em {
        Some(p) => match (p.strip_prefix("~/").or_else(|| p.strip_prefix("~\\")), &casa) {
            (Some(resto), Some(casa)) => casa.join(resto),
            _ => PathBuf::from(p),
        },
        None => std::env::var_os("CLAUDE_CONFIG_DIR")
            .filter(|v| !v.is_empty())
            .map(PathBuf::from)
            .or_else(|| casa.map(|c| c.join(".claude")))
            .ok_or("Não achei a pasta do Claude Code: diga qual com --em <pasta>.")?,
    };
    let vl = std::env::current_exe().map_err(|e| e.to_string())?.to_string_lossy().replace('\\', "/");
    let pasta = base.join("skills").join("vlauncher");
    fs::create_dir_all(&pasta).map_err(|e| format!("Não consegui criar {}: {e}", pasta.display()))?;
    let arquivo = pasta.join("SKILL.md");
    fs::write(&arquivo, SKILL.replace(CAMINHO_PADRAO, &vl)).map_err(|e| format!("Não consegui gravar {}: {e}", arquivo.display()))?;
    Ok(format!("Skill vlauncher instalada em {}.", arquivo.display()))
}

#[cfg(test)]
mod testes {
    use super::*;

    fn ler(linha: &str) -> Result<Opcoes, String> {
        ler_opcoes(&linha.split_whitespace().map(String::from).collect::<Vec<_>>())
    }

    #[test]
    fn le_o_comando_o_app_e_as_opcoes() {
        let o = ler("rodar loja online -v preview --local=feat/x --sem-esperar").unwrap();
        assert_eq!(o.comando, "rodar");
        assert_eq!(o.app, ["loja", "online"]);
        assert_eq!(o.variacao.as_deref(), Some("preview"));
        assert_eq!(o.local.as_deref(), Some("feat/x"));
        assert!(o.sem_esperar);

        let o = ler("logs api -n 200 --json").unwrap();
        assert_eq!((o.comando.as_str(), o.linhas, o.json), ("saida", Some(200), true));
        assert!(ler("stop --todas").unwrap().todas);
        assert_eq!(ler("").unwrap().comando, "");
    }

    #[test]
    fn recusa_o_que_nao_conhece() {
        assert!(ler("explodir").is_err());
        assert!(ler("rodar --forca").is_err());
        assert!(ler("saida -n muitas").is_err());
        assert!(ler("rodar -v").is_err());
    }

    #[test]
    fn a_skill_traz_o_caminho_padrao_do_vl() {
        assert!(SKILL.replace("\r\n", "\n").starts_with("---\nname: vlauncher\n"));
        assert!(SKILL.contains(CAMINHO_PADRAO));
    }
}
