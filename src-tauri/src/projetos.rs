//! Reconhece um projeto numa pasta: nome, se é git, o gerenciador de pacotes e o que sobe o app
//! (os scripts dev, start, *:all de um package.json, o pacote Python com __main__.py, o compose de
//! desenvolvimento...), para sugerir as variações ao adicionar.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
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

/// O compose de produção (roda só no servidor, com o que o deploy grava, como as imagens publicadas)
/// e o override (que o compose junta sozinho ao principal) nunca viram variação.
fn compose_local(arquivo: &str) -> bool {
    let n = arquivo.to_lowercase();
    !n.contains("prod") && !n.contains("override")
}

/// O compose que o `docker compose` lê sem o -f (e que junta com o override).
fn compose_principal(arquivo: &str) -> bool {
    matches!(arquivo.to_lowercase().as_str(), "docker-compose.yml" | "docker-compose.yaml" | "compose.yml" | "compose.yaml")
}

/// Os composes que sobem o projeto na máquina: o de desenvolvimento primeiro, depois o principal. O
/// --build refaz as imagens que mudaram (é o que se quer depois de mexer no código).
pub fn sugestoes_do_compose(arquivos: &[String]) -> Vec<Sugestao> {
    let mut locais: Vec<&String> = arquivos.iter().filter(|a| compose_local(a)).collect();
    locais.sort_by_key(|a| (!a.to_lowercase().contains("dev"), !compose_principal(a), a.to_lowercase()));
    let mut sugestoes: Vec<Sugestao> = Vec::new();
    for arquivo in locais {
        let s = if compose_principal(arquivo) {
            Sugestao { nome: "docker".into(), comando: "docker compose up --build".into() }
        } else {
            Sugestao { nome: format!("docker ({arquivo})"), comando: format!("docker compose -f {arquivo} up --build") }
        };
        if !sugestoes.iter().any(|x| x.comando == s.comando) {
            sugestoes.push(s);
        }
    }
    sugestoes
}

/// O compose monta a imagem do próprio app (tem `build:`), e não só a de um banco ou de um Redis: aí
/// ele sobe o projeto inteiro e vem antes das outras sugestões.
fn compose_sobe_o_app(pasta: &Path, arquivos: &[String]) -> bool {
    arquivos
        .iter()
        .filter(|a| compose_local(a))
        .any(|a| fs::read_to_string(pasta.join(a)).is_ok_and(|texto| texto.contains("build:")))
}

/// O texto das dependências Python (pyproject.toml e requirements*.txt), para achar o Streamlit.
fn dependencias_python(pasta: &Path) -> String {
    ["pyproject.toml", "requirements.txt", "requirements-dev.txt"]
        .iter()
        .filter_map(|arquivo| fs::read_to_string(pasta.join(arquivo)).ok())
        .collect::<Vec<_>>()
        .join("\n")
        .to_lowercase()
}

/// Como chamar o Python do projeto: pelo uv (com uv.lock), pelo venv da pasta, pelo poetry ou o do PATH.
/// Devolve também o prefixo dos scripts instalados ([project.scripts]).
fn python_do_projeto(pasta: &Path) -> (String, String) {
    if pasta.join("uv.lock").is_file() {
        return ("uv run python".into(), "uv run ".into());
    }
    for venv in [".venv", "venv", "env"] {
        if pasta.join(venv).join("Scripts").join("python.exe").is_file() {
            return (format!(r"{venv}\Scripts\python"), format!(r"{venv}\Scripts\"));
        }
    }
    if pasta.join("poetry.lock").is_file() {
        return ("poetry run python".into(), "poetry run ".into());
    }
    ("python".into(), String::new())
}

/// Os nomes da seção [project.scripts] do pyproject.toml (sem um leitor de TOML: só `nome = "..."`).
fn scripts_do_pyproject(pasta: &Path) -> Vec<String> {
    let Ok(texto) = fs::read_to_string(pasta.join("pyproject.toml")) else { return vec![] };
    let mut dentro = false;
    let mut nomes = Vec::new();
    for linha in texto.lines().map(str::trim) {
        if linha.starts_with('[') {
            dentro = linha == "[project.scripts]";
        } else if dentro {
            if let Some((nome, _)) = linha.split_once('=') {
                let nome = nome.trim().trim_matches('"');
                if !nome.is_empty() && !nome.starts_with('#') {
                    nomes.push(nome.to_string());
                }
            }
        }
    }
    nomes
}

/// Os pacotes que rodam com `python -m` (têm __main__.py), na raiz ou em src/.
fn pacotes_executaveis(pasta: &Path) -> Vec<String> {
    let mut nomes = Vec::new();
    for base in [pasta.to_path_buf(), pasta.join("src")] {
        let Ok(entradas) = fs::read_dir(&base) else { continue };
        for entrada in entradas.flatten() {
            let nome = entrada.file_name().to_string_lossy().into_owned();
            let ignorado = nome.starts_with(['.', '_']) || matches!(nome.as_str(), "tests" | "test" | "node_modules" | "build" | "dist");
            if !ignorado && entrada.path().join("__main__.py").is_file() {
                nomes.push(nome);
            }
        }
    }
    nomes.sort();
    nomes.dedup();
    nomes
}

/// O que sobe um projeto Python: os scripts do pyproject, os pacotes com __main__.py, o runserver do
/// Django e, sem nada disso, o arquivo principal (pelo Streamlit, se ele estiver nas dependências).
pub fn sugestoes_python(pasta: &Path) -> Vec<Sugestao> {
    let (python, prefixo) = python_do_projeto(pasta);
    let mut sugestoes: Vec<Sugestao> =
        scripts_do_pyproject(pasta).into_iter().map(|nome| Sugestao { comando: format!("{prefixo}{nome}"), nome }).collect();
    for pacote in pacotes_executaveis(pasta) {
        sugestoes.push(Sugestao { comando: format!("{python} -m {pacote}"), nome: pacote });
    }
    if pasta.join("manage.py").is_file() {
        sugestoes.push(Sugestao { nome: "runserver".into(), comando: format!("{python} manage.py runserver") });
    }
    if sugestoes.is_empty() {
        let streamlit = dependencias_python(pasta).contains("streamlit");
        let principal = ["streamlit_app.py", "app.py", "main.py", "Home.py"].into_iter().find(|a| pasta.join(a).is_file());
        if let Some(arquivo) = principal {
            sugestoes.push(if streamlit {
                Sugestao { nome: "streamlit".into(), comando: format!("{python} -m streamlit run {arquivo}") }
            } else {
                Sugestao { nome: arquivo.trim_end_matches(".py").to_string(), comando: format!("{python} {arquivo}") }
            });
        }
    }
    sugestoes
}

/// Sem package.json na raiz, os das subpastas (backend/, frontend/, web/...): o script que sobe cada uma,
/// rodando na própria subpasta.
pub fn sugestoes_das_subpastas(pasta: &Path) -> Vec<Sugestao> {
    let Ok(entradas) = fs::read_dir(pasta) else { return vec![] };
    let mut subpastas: Vec<PathBuf> = entradas
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.join("package.json").is_file())
        .filter(|p| p.file_name().is_some_and(|n| !n.to_string_lossy().starts_with('.') && n != "node_modules"))
        .collect();
    subpastas.sort();
    subpastas
        .iter()
        .take(6)
        .filter_map(|sub| {
            let nome = sub.file_name()?.to_string_lossy().into_owned();
            let texto = fs::read_to_string(sub.join("package.json")).ok()?;
            let pacote: serde_json::Value = serde_json::from_str(texto.trim_start_matches('\u{feff}')).ok()?;
            let scripts = pacote.get("scripts")?.as_object()?;
            let script = ["dev", "start", "serve"].into_iter().find(|s| scripts.contains_key(*s))?;
            let entrar = if nome.contains(' ') { format!("cd \"{nome}\"") } else { format!("cd {nome}") };
            Some(Sugestao {
                nome: format!("{nome} · {script}"),
                comando: format!("{entrar} && {}", rodar_script(&gerenciador(sub, &pacote), script)),
            })
        })
        .collect()
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
        sugestoes.extend(sugestoes_python(pasta));
    } else if pasta.join("Cargo.toml").is_file() {
        tipo = "rust".into();
        sugestoes.push(Sugestao { nome: "run".into(), comando: "cargo run".into() });
    }

    // Sem package.json na raiz, um monorepo de pastas soltas (backend/, frontend/) sobe por elas.
    if tipo != "node" {
        let das_subpastas = sugestoes_das_subpastas(pasta);
        if tipo == "pasta" && !das_subpastas.is_empty() {
            tipo = "node".into();
        }
        sugestoes.extend(das_subpastas);
    }

    // O compose de desenvolvimento. Num projeto node, fica entre os outros scripts. Fora dele, é um jeito
    // de subir: vem primeiro se monta a imagem do próprio app (sobe tudo), e por último se só traz um
    // banco ou um Redis.
    let composes = sugestoes_do_compose(&compose);
    if tipo == "node" && pasta.join("package.json").is_file() {
        outros_scripts.extend(composes);
    } else if !composes.is_empty() {
        if tipo == "pasta" {
            tipo = "docker".into();
        }
        if compose_sobe_o_app(pasta, &compose) {
            sugestoes.splice(0..0, composes);
        } else {
            sugestoes.extend(composes);
        }
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

    /// Uma pasta temporária com os arquivos pedidos (os que terminam em / viram pastas).
    struct Pasta(PathBuf);
    impl Pasta {
        fn nova(nome: &str, arquivos: &[(&str, &str)]) -> Pasta {
            let raiz = std::env::temp_dir().join(format!("vlauncher-teste-{nome}-{}", std::process::id()));
            let _ = fs::remove_dir_all(&raiz);
            for (caminho, conteudo) in arquivos {
                let alvo = raiz.join(caminho);
                fs::create_dir_all(alvo.parent().unwrap()).unwrap();
                fs::write(alvo, conteudo).unwrap();
            }
            fs::create_dir_all(raiz.join(".git")).unwrap();
            Pasta(raiz)
        }
        fn sugestoes(&self) -> Vec<(String, String)> {
            inspecionar(&self.0).unwrap().sugestoes.into_iter().map(|s| (s.nome, s.comando)).collect()
        }
    }
    impl Drop for Pasta {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn par(nome: &str, comando: &str) -> (String, String) {
        (nome.to_string(), comando.to_string())
    }

    #[test]
    fn o_compose_de_producao_nunca_vira_variacao() {
        let nomes = |a: &[&str]| sugestoes_do_compose(&a.iter().map(|s| s.to_string()).collect::<Vec<_>>());
        let s = nomes(&["docker-compose.producao.yml", "docker-compose.yml"]);
        assert_eq!(s.len(), 1);
        assert_eq!((s[0].nome.as_str(), s[0].comando.as_str()), ("docker", "docker compose up --build"));
        // O de desenvolvimento primeiro; o override e o de produção, nunca.
        let s = nomes(&["compose.yaml", "docker-compose.dev.yml", "docker-compose.override.yml", "docker-compose.prod.yml"]);
        let comandos: Vec<&str> = s.iter().map(|x| x.comando.as_str()).collect();
        assert_eq!(comandos, ["docker compose -f docker-compose.dev.yml up --build", "docker compose up --build"]);
    }

    #[test]
    fn um_monorepo_de_pastas_soltas_sobe_pelo_compose_e_pelas_subpastas() {
        let p = Pasta::nova(
            "monorepo",
            &[
                ("docker-compose.yml", "services:\n  api:\n    build: ./backend\n"),
                ("docker-compose.producao.yml", "services:\n  api:\n    image: ${API_IMAGE}\n"),
                ("backend/package.json", r#"{"scripts":{"dev":"tsx watch src","build":"tsc"}}"#),
                ("backend/pnpm-lock.yaml", ""),
                ("frontend/package.json", r#"{"scripts":{"dev":"vite"}}"#),
                ("frontend/pnpm-lock.yaml", ""),
            ],
        );
        assert_eq!(
            p.sugestoes(),
            [par("docker", "docker compose up --build"), par("backend · dev", "cd backend && pnpm dev"), par("frontend · dev", "cd frontend && pnpm dev")]
        );
    }

    #[test]
    fn um_projeto_python_sobe_pelo_pacote_com_o_python_dele() {
        // uv, com o pacote em src/ e um compose que monta a imagem do app.
        let uv = Pasta::nova(
            "uv",
            &[
                ("pyproject.toml", "[project]\nname = \"bot\"\n"),
                ("uv.lock", ""),
                ("src/bot/__main__.py", ""),
                ("tests/__main__.py", ""),
                ("Dockerfile", ""),
                ("docker-compose.yml", "services:\n  bot:\n    build: .\n"),
            ],
        );
        assert_eq!(uv.sugestoes(), [par("docker", "docker compose up --build"), par("bot", "uv run python -m bot")]);

        // venv na pasta, pacote na raiz.
        let venv = Pasta::nova("venv", &[("requirements.txt", "yt-dlp\n"), (".venv/Scripts/python.exe", ""), ("app/__main__.py", "")]);
        assert_eq!(venv.sugestoes(), [par("app", r".venv\Scripts\python -m app")]);

        // Streamlit, sem pacote: o arquivo principal pelo streamlit.
        let streamlit = Pasta::nova("streamlit", &[("requirements.txt", "streamlit==1.50\npandas\n"), ("app.py", "")]);
        assert_eq!(streamlit.sugestoes(), [par("streamlit", "python -m streamlit run app.py")]);

        // Os scripts do pyproject e o compose que só traz um Redis (vem por último).
        let scripts = Pasta::nova(
            "scripts",
            &[
                ("pyproject.toml", "[project]\nname = \"x\"\n\n[project.scripts]\nservidor = \"x.main:rodar\"\n\n[tool.ruff]\n"),
                ("uv.lock", ""),
                ("compose.yaml", "services:\n  redis:\n    image: redis:8\n"),
            ],
        );
        assert_eq!(scripts.sugestoes(), [par("servidor", "uv run servidor"), par("docker", "docker compose up --build")]);
    }
}
