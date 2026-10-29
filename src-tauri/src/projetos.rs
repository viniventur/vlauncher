//! Reconhece um projeto numa pasta: nome, se é git, o gerenciador de pacotes e os scripts que
//! sobem o app (dev, start, *:all...), para sugerir as variações ao adicionar.

use serde::Serialize;
use std::fs;
use std::path::Path;
use std::time::SystemTime;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sugestao {
    pub nome: String,
    pub comando: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Projeto {
    pub pasta: String,
    pub nome: String,
    pub eh_git: bool,
    pub gerenciador: Option<String>,
    /// Os scripts que sobem o app, já com o comando do gerenciador.
    pub sugestoes: Vec<Sugestao>,
    /// Os outros scripts do package.json, para quem quiser escolher.
    pub outros_scripts: Vec<Sugestao>,
    pub tipo: String,
}

fn modificado(caminho: &Path) -> Option<SystemTime> {
    fs::metadata(caminho).and_then(|m| m.modified()).ok()
}

/// O gerenciador do projeto: o campo packageManager; senão, o arquivo de lock (com dois, o mais
/// recente, que é o que se usa de fato).
fn gerenciador(pasta: &Path, pacote: &serde_json::Value) -> String {
    if let Some(pm) = pacote.get("packageManager").and_then(|v| v.as_str()) {
        if let Some((nome, _)) = pm.split_once('@') {
            return nome.to_string();
        }
    }
    let locks = [
        ("pnpm", "pnpm-lock.yaml"),
        ("yarn", "yarn.lock"),
        ("bun", "bun.lock"),
        ("bun", "bun.lockb"),
        ("npm", "package-lock.json"),
    ];
    locks
        .iter()
        .filter_map(|(nome, arquivo)| modificado(&pasta.join(arquivo)).map(|data| (data, *nome)))
        .max_by_key(|(data, _)| *data)
        .map(|(_, nome)| nome.to_string())
        .unwrap_or_else(|| "npm".into())
}

pub fn rodar_script(gerenciador: &str, script: &str) -> String {
    match gerenciador {
        "yarn" => format!("yarn {script}"),
        "bun" => format!("bun run {script}"),
        "pnpm" => format!("pnpm {script}"),
        _ => format!("npm run {script}"),
    }
}

/// Prefixos de script que nunca sobem o app: banco (migração, seed), build, testes, lint.
const NAO_SOBEM: [&str; 10] = ["db", "build", "test", "lint", "format", "typecheck", "migrate", "migration", "seed", "deploy"];

/// Os scripts que sobem o app (os que se quer no launcher). O `*:all` só vale com um dois-pontos
/// (dev:all, public:all, prod:all): há projeto com dezenas de migrações em `db:...:all`, e
/// nenhuma delas pode virar uma variação por engano.
pub fn sobe_o_app(script: &str) -> bool {
    let s = script.to_lowercase();
    let prefixo = s.split(':').next().unwrap_or_default();
    if NAO_SOBEM.contains(&prefixo) {
        return false;
    }
    let tudo = s.matches(':').count() == 1 && s.ends_with(":all");
    s == "dev" || s == "start" || s == "serve" || s == "preview" || s.starts_with("dev:") || s.starts_with("start:") || s.starts_with("serve:") || tudo
}

fn arquivos_compose(pasta: &Path) -> Vec<String> {
    let Ok(entradas) = fs::read_dir(pasta) else { return vec![] };
    let mut nomes: Vec<String> = entradas
        .flatten()
        .filter_map(|e| e.file_name().into_string().ok())
        .filter(|n| {
            let n = n.to_lowercase();
            (n.starts_with("docker-compose") || n.starts_with("compose")) && (n.ends_with(".yml") || n.ends_with(".yaml"))
        })
        .collect();
    nomes.sort();
    nomes
}

pub fn inspecionar(pasta: &Path) -> Option<Projeto> {
    let nome = pasta.file_name()?.to_string_lossy().into_owned();
    let eh_git = pasta.join(".git").exists();
    let compose = arquivos_compose(pasta);
    let mut sugestoes = Vec::new();
    let mut outros_scripts = Vec::new();
    let mut gerenciador_achado = None;
    let mut tipo = String::from("pasta");

    let caminho_pacote = pasta.join("package.json");
    if let Ok(texto) = fs::read_to_string(&caminho_pacote) {
        tipo = "node".into();
        let pacote: serde_json::Value = serde_json::from_str(texto.trim_start_matches('\u{feff}')).unwrap_or_default();
        let pm = gerenciador(pasta, &pacote);
        if let Some(scripts) = pacote.get("scripts").and_then(|s| s.as_object()) {
            for (script, _) in scripts {
                if script.starts_with('_') {
                    continue; // comentários em forma de script ("_comment_typecheck")
                }
                let s = Sugestao { nome: script.clone(), comando: rodar_script(&pm, script) };
                if sobe_o_app(script) {
                    sugestoes.push(s);
                } else {
                    outros_scripts.push(s);
                }
            }
        }
        // O dev primeiro, os *:all logo depois: os mais usados no topo.
        sugestoes.sort_by_key(|s| (s.nome != "dev", !s.nome.ends_with(":all"), s.nome.clone()));
        gerenciador_achado = Some(pm);
    } else if pasta.join("pyproject.toml").is_file() || pasta.join("requirements.txt").is_file() {
        tipo = "python".into();
    } else if pasta.join("Cargo.toml").is_file() {
        tipo = "rust".into();
        sugestoes.push(Sugestao { nome: "run".into(), comando: "cargo run".into() });
    }

    // Só com Docker (um serviço de autenticação, por exemplo), o compose é o jeito de subir: vira sugestão, o de
    // desenvolvimento primeiro. Num projeto node, fica entre os outros.
    let so_docker = tipo == "pasta" && !compose.is_empty();
    let mut composes: Vec<Sugestao> = compose
        .iter()
        .map(|arquivo| Sugestao {
            nome: if compose.len() == 1 { "docker".to_string() } else { format!("docker ({arquivo})") },
            comando: format!("docker compose -f {arquivo} up"),
        })
        .collect();
    composes.sort_by_key(|s| !s.comando.contains(".dev."));
    if so_docker {
        tipo = "docker".into();
        sugestoes.extend(composes);
    } else {
        outros_scripts.extend(composes);
    }

    if !eh_git && tipo == "pasta" {
        return None;
    }
    Some(Projeto {
        pasta: crate::git::normalizar(&pasta.to_string_lossy()),
        nome,
        eh_git,
        gerenciador: gerenciador_achado,
        sugestoes,
        outros_scripts,
        tipo,
    })
}

#[tauri::command]
pub async fn inspecionar_pasta(pasta: String) -> Result<Option<Projeto>, String> {
    tauri::async_runtime::spawn_blocking(move || inspecionar(Path::new(&pasta))).await.map_err(|e| e.to_string())
}

/// Os projetos que estão direto dentro da pasta (a pasta de um grupo, como D:\projetos\trabalho).
#[tauri::command]
pub async fn escanear_pasta(pasta: String) -> Result<Vec<Projeto>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let entradas = fs::read_dir(&pasta).map_err(|e| format!("Não consegui ler {pasta}: {e}"))?;
        let mut projetos: Vec<Projeto> = entradas
            .flatten()
            .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
            .filter(|e| {
                let n = e.file_name().to_string_lossy().to_lowercase();
                !n.starts_with('.') && n != "node_modules"
            })
            .filter_map(|e| inspecionar(&e.path()))
            .collect();
        projetos.sort_by_key(|p| p.nome.to_lowercase());
        Ok(projetos)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn escolhe_os_scripts_que_sobem_o_app() {
        for s in ["dev", "dev:all", "dev:api", "start", "public:all", "preview"] {
            assert!(sobe_o_app(s), "{s}");
        }
        for s in ["build", "test", "lint", "db:seed", "typecheck", "db:all", "db:create-escolas-table:all", "build:dev", "x:y:all"] {
            assert!(!sobe_o_app(s), "{s}");
        }
        assert!(sobe_o_app("prod:all"));
    }

    #[test]
    fn inspeciona_o_proprio_launcher() {
        let raiz = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
        let projeto = inspecionar(raiz).unwrap();
        assert_eq!(projeto.tipo, "node");
        assert_eq!(projeto.gerenciador.as_deref(), Some("pnpm"));
        assert_eq!(projeto.sugestoes[0].nome, "dev");
        assert_eq!(projeto.sugestoes[0].comando, "pnpm dev");
        assert!(projeto.outros_scripts.iter().any(|s| s.nome == "build"));
    }

    #[test]
    fn monta_o_comando_do_gerenciador() {
        assert_eq!(rodar_script("npm", "dev:all"), "npm run dev:all");
        assert_eq!(rodar_script("pnpm", "dev"), "pnpm dev");
    }
}
