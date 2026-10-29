//! Onde rodar: as worktrees do repositório e as branches que ainda não têm uma. Também prepara
//! uma worktree nova, que nasce sem node_modules e sem os arquivos locais (.env, .npmrc) que o
//! git não leva. Um app numa subpasta do repositório (um monorepo) roda na mesma subpasta de cada
//! worktree.

use crate::sistema::comando;
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

/// Pasta das worktrees novas, dentro do repositório: a mesma que o Claude Code usa.
const PASTA_WORKTREES_PADRAO: &str = ".claude/worktrees";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Worktree {
    /// A raiz da worktree.
    pub caminho: String,
    /// Onde o app roda nela: a raiz ou, num monorepo, a subpasta do app.
    pub pasta: String,
    pub branch: Option<String>,
    pub head: String,
    pub principal: bool,
    pub podavel: bool,
    pub travada: bool,
    pub existe: bool,
    /// Tem package.json e não tem node_modules.
    pub precisa_dependencias: bool,
    /// Arquivos locais da pasta principal (.env, .npmrc...) que faltam aqui.
    pub arquivos_faltando: Vec<String>,
    /// Data do último commit da branch (segundos), para ordenar.
    pub data: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    /// "feat/x" (local) ou "origin/feat/x" (remota).
    pub nome: String,
    pub remota: bool,
    pub data: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Locais {
    pub eh_git: bool,
    /// A subpasta do app dentro do repositório ("" quando o app é o repositório inteiro).
    pub subpasta: String,
    pub worktrees: Vec<Worktree>,
    /// Só as branches sem worktree, da mais recente para a mais antiga.
    pub branches: Vec<Branch>,
}

pub fn normalizar(caminho: &str) -> String {
    caminho.replace('/', "\\").trim_end_matches('\\').to_string()
}

/// O caminho de `pasta` dentro de `raiz` ("" se for a própria raiz; None se estiver fora dela).
pub fn subpasta(pasta: &str, raiz: &str) -> Option<String> {
    let (p, r) = (normalizar(pasta), normalizar(raiz));
    if p.eq_ignore_ascii_case(&r) {
        return Some(String::new());
    }
    let prefixo = format!("{r}\\");
    (p.len() > prefixo.len() && p.is_char_boundary(prefixo.len()) && p[..prefixo.len()].eq_ignore_ascii_case(&prefixo))
        .then(|| p[prefixo.len()..].to_string())
}

fn juntar(raiz: &str, sub: &str) -> String {
    if sub.is_empty() {
        raiz.to_string()
    } else {
        format!("{raiz}\\{sub}")
    }
}

pub fn git(pasta: &str, args: &[&str]) -> Result<String, String> {
    let saida = comando("git")
        .arg("-C")
        .arg(pasta)
        .args(args)
        .output()
        .map_err(|e| format!("Não consegui rodar o git: {e}"))?;
    if !saida.status.success() {
        let erro = String::from_utf8_lossy(&saida.stderr).trim().to_string();
        return Err(if erro.is_empty() { format!("git {} falhou.", args.join(" ")) } else { erro });
    }
    Ok(String::from_utf8_lossy(&saida.stdout).into_owned())
}

/// Os arquivos que ficam fora do git e que o app precisa para rodar.
fn eh_arquivo_local(nome: &str) -> bool {
    let n = nome.to_lowercase();
    if n == ".npmrc" {
        return true;
    }
    n.starts_with(".env")
        && ![".example", ".sample", ".template", ".dist", ".exemplo", ".modelo"]
            .iter()
            .any(|sufixo| n.ends_with(sufixo))
}

fn arquivos_locais(pasta: &Path) -> Vec<String> {
    let Ok(entradas) = fs::read_dir(pasta) else { return vec![] };
    let mut nomes: Vec<String> = entradas
        .flatten()
        .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
        .filter_map(|e| e.file_name().into_string().ok())
        .filter(|n| eh_arquivo_local(n))
        .collect();
    nomes.sort();
    nomes
}

/// O package.json da pasta pede pacotes (sem dependência nenhuma, a falta do node_modules não importa).
fn tem_dependencias(pasta: &Path) -> bool {
    let Ok(texto) = fs::read_to_string(pasta.join("package.json")) else { return false };
    let pacote: serde_json::Value = serde_json::from_str(texto.trim_start_matches('\u{feff}')).unwrap_or_default();
    ["dependencies", "devDependencies"]
        .iter()
        .any(|campo| pacote.get(campo).and_then(|d| d.as_object()).is_some_and(|d| !d.is_empty()))
}

pub fn ler_worktrees(porcelana: &str) -> Vec<(String, Option<String>, String, bool, bool)> {
    // (caminho, branch, head, podavel, travada)
    let mut lista = Vec::new();
    for bloco in porcelana.split("\n\n") {
        let mut caminho = None;
        let mut branch = None;
        let mut head = String::new();
        let mut podavel = false;
        let mut travada = false;
        let mut nua = false;
        for linha in bloco.lines() {
            if let Some(c) = linha.strip_prefix("worktree ") {
                caminho = Some(normalizar(c));
            } else if let Some(h) = linha.strip_prefix("HEAD ") {
                head = h.chars().take(9).collect();
            } else if let Some(b) = linha.strip_prefix("branch ") {
                branch = Some(b.trim_start_matches("refs/heads/").to_string());
            } else if linha.starts_with("prunable") {
                podavel = true;
            } else if linha.starts_with("locked") {
                travada = true;
            } else if linha == "bare" {
                nua = true;
            }
        }
        if let (Some(c), false) = (caminho, nua) {
            lista.push((c, branch, head, podavel, travada));
        }
    }
    lista
}

fn listar(pasta: &str) -> Result<Locais, String> {
    if git(pasta, &["rev-parse", "--git-dir"]).is_err() {
        return Ok(Locais { eh_git: false, subpasta: String::new(), worktrees: vec![], branches: vec![] });
    }

    let mut datas: HashMap<String, i64> = HashMap::new();
    let mut todas: Vec<Branch> = Vec::new();
    let refs = git(pasta, &["for-each-ref", "--sort=-committerdate", "--format=%(refname)%09%(committerdate:unix)", "refs/heads", "refs/remotes"])?;
    for linha in refs.lines() {
        let Some((nome, data)) = linha.split_once('\t') else { continue };
        let data = data.trim().parse().unwrap_or(0);
        if let Some(local) = nome.strip_prefix("refs/heads/") {
            datas.insert(local.to_string(), data);
            todas.push(Branch { nome: local.to_string(), remota: false, data });
        } else if let Some(remota) = nome.strip_prefix("refs/remotes/") {
            if !remota.ends_with("/HEAD") {
                todas.push(Branch { nome: remota.to_string(), remota: true, data });
            }
        }
    }

    let porcelana = git(pasta, &["worktree", "list", "--porcelain"])?;
    let lidas = ler_worktrees(&porcelana.replace("\r\n", "\n"));
    let principal = lidas.first().map(|w| w.0.clone()).unwrap_or_else(|| normalizar(pasta));
    let sub = subpasta(pasta, &principal).unwrap_or_default();
    let locais_da_principal = arquivos_locais(Path::new(&juntar(&principal, &sub)));

    let worktrees: Vec<Worktree> = lidas
        .into_iter()
        .enumerate()
        .map(|(i, (caminho, branch, head, podavel, travada))| {
            let pasta_do_app = juntar(&caminho, &sub);
            let dir = Path::new(&pasta_do_app);
            let existe = dir.is_dir();
            let arquivos_faltando = if i == 0 || !existe {
                vec![]
            } else {
                locais_da_principal.iter().filter(|n| !dir.join(n).exists()).cloned().collect()
            };
            Worktree {
                data: branch.as_ref().and_then(|b| datas.get(b).copied()),
                precisa_dependencias: existe && tem_dependencias(dir) && !dir.join("node_modules").is_dir(),
                pasta: pasta_do_app.clone(),
                caminho,
                branch,
                head,
                principal: i == 0,
                podavel,
                travada,
                existe,
                arquivos_faltando,
            }
        })
        .collect();

    // Fora as que já têm worktree, e a remota que já tem a local com o mesmo nome.
    let com_worktree: Vec<&str> = worktrees.iter().filter_map(|w| w.branch.as_deref()).collect();
    let locais: Vec<String> = todas.iter().filter(|b| !b.remota).map(|b| b.nome.clone()).collect();
    let branches = todas
        .into_iter()
        .filter(|b| {
            let curto = if b.remota { b.nome.split_once('/').map(|(_, r)| r).unwrap_or(&b.nome) } else { &b.nome };
            !com_worktree.contains(&curto) && !(b.remota && locais.iter().any(|l| l == curto))
        })
        .collect();

    Ok(Locais { eh_git: true, subpasta: sub, worktrees, branches })
}

#[tauri::command]
pub async fn listar_locais(pasta: String) -> Result<Locais, String> {
    tauri::async_runtime::spawn_blocking(move || listar(&pasta)).await.map_err(|e| e.to_string())?
}

/// Em que repositório e em que worktree uma pasta está.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OndeEsta {
    /// A raiz da pasta principal do repositório (a primeira worktree).
    pub raiz_principal: String,
    /// A raiz da worktree em que a pasta está (a própria principal, se for ela).
    pub raiz: String,
    pub branch: Option<String>,
    pub head: String,
}

fn onde_esta_a_pasta(pasta: &str) -> Option<OndeEsta> {
    let raiz = normalizar(git(pasta, &["rev-parse", "--show-toplevel"]).ok()?.trim());
    let porcelana = git(pasta, &["worktree", "list", "--porcelain"]).ok()?;
    let lidas = ler_worktrees(&porcelana.replace("\r\n", "\n"));
    let raiz_principal = lidas.first()?.0.clone();
    let atual = lidas.into_iter().find(|w| w.0.eq_ignore_ascii_case(&raiz));
    Some(OndeEsta {
        raiz_principal,
        raiz,
        branch: atual.as_ref().and_then(|w| w.1.clone()),
        head: atual.map(|w| w.2).unwrap_or_default(),
    })
}

/// Para o `vl`: a pasta de onde ele foi chamado está em que worktree (None: fora de um repositório).
#[tauri::command]
pub async fn onde_esta(pasta: String) -> Result<Option<OndeEsta>, String> {
    tauri::async_runtime::spawn_blocking(move || onde_esta_a_pasta(&pasta)).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn buscar_branches(pasta: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || git(&pasta, &["fetch", "--all", "--prune"]).map(|_| ()))
        .await
        .map_err(|e| e.to_string())?
}

/// "feat/painel-x" → "feat-painel-x", como as pastas que já existem em .claude/worktrees.
pub fn nome_de_pasta(branch: &str) -> String {
    branch
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' { c } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

/// Cria a worktree da branch e devolve o caminho dela. Uma branch remota ganha a local com o mesmo
/// nome, que acompanha a remota.
#[tauri::command]
pub async fn criar_worktree(repositorio: String, branch: String, remota: bool, pasta_base: Option<String>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let local = if remota { branch.split_once('/').map(|(_, r)| r.to_string()).unwrap_or(branch.clone()) } else { branch.clone() };
        let base = pasta_base.filter(|b| !b.trim().is_empty()).unwrap_or_else(|| PASTA_WORKTREES_PADRAO.to_string());
        let base = if Path::new(&base).is_absolute() { PathBuf::from(&base) } else { Path::new(&repositorio).join(&base) };
        let destino = base.join(nome_de_pasta(&local));
        if destino.exists() {
            return Err(format!("Já existe a pasta {}.", destino.display()));
        }
        let destino_txt = normalizar(&destino.to_string_lossy());

        let ja_tem_local = git(&repositorio, &["rev-parse", "--verify", "--quiet", &format!("refs/heads/{local}")]).is_ok();
        if remota && !ja_tem_local {
            git(&repositorio, &["worktree", "add", "--track", "-b", &local, &destino_txt, &branch])?;
        } else {
            git(&repositorio, &["worktree", "add", &destino_txt, &local])?;
        }
        Ok(destino_txt)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Troca a branch da pasta principal. Só com a árvore limpa e sem nada rodando nela.
#[tauri::command]
pub async fn trocar_branch(app: AppHandle, pasta: String, branch: String, remota: bool) -> Result<(), String> {
    if crate::processos::rodando_na_pasta(&app, &pasta) {
        return Err("Tem um app rodando nesta pasta. Pare antes de trocar a branch.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let sujo = git(&pasta, &["status", "--porcelain", "--untracked-files=no"])?;
        if !sujo.trim().is_empty() {
            return Err("A pasta tem mudanças sem commit. Faça commit ou stash antes de trocar a branch.".into());
        }
        let local = if remota { branch.split_once('/').map(|(_, r)| r.to_string()).unwrap_or(branch.clone()) } else { branch };
        git(&pasta, &["switch", &local]).map(|_| ())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Copia da pasta principal os arquivos locais que faltam na worktree. Nunca sobrescreve.
#[tauri::command]
pub fn copiar_arquivos_locais(origem: String, destino: String) -> Result<Vec<String>, String> {
    let origem = Path::new(&origem);
    let destino = Path::new(&destino);
    let mut copiados = Vec::new();
    for nome in arquivos_locais(origem) {
        let alvo = destino.join(&nome);
        if !alvo.exists() {
            fs::copy(origem.join(&nome), &alvo).map_err(|e| format!("Não consegui copiar {nome}: {e}"))?;
            copiados.push(nome);
        }
    }
    Ok(copiados)
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn le_a_lista_de_worktrees() {
        let porcelana = "worktree D:/proj/app\nHEAD a5fd782cf1234\nbranch refs/heads/main\n\n\
                         worktree D:/proj/app/.claude/worktrees/x\nHEAD d73bca15d999\ndetached\n\n\
                         worktree D:/proj/app/.claude/worktrees/y\nHEAD b849f74aaa\nbranch refs/heads/feat/y\nprunable gitdir file points to non-existent location\n";
        let lidas = ler_worktrees(porcelana);
        assert_eq!(lidas.len(), 3);
        assert_eq!(lidas[0].0, "D:\\proj\\app");
        assert_eq!(lidas[0].1.as_deref(), Some("main"));
        assert_eq!(lidas[1].1, None);
        assert_eq!(lidas[1].2, "d73bca15d");
        assert_eq!(lidas[2].1.as_deref(), Some("feat/y"));
        assert!(lidas[2].3);
    }

    #[test]
    fn reconhece_arquivos_locais() {
        assert!(eh_arquivo_local(".env"));
        assert!(eh_arquivo_local(".env.local"));
        assert!(eh_arquivo_local(".npmrc"));
        assert!(!eh_arquivo_local(".env.example"));
        assert!(!eh_arquivo_local("package.json"));
    }

    #[test]
    fn lista_as_pastas_do_proprio_repositorio() {
        let raiz = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().to_string_lossy().into_owned();
        let locais = listar(&raiz).unwrap();
        assert!(locais.eh_git);
        let principal = &locais.worktrees[0];
        assert!(principal.principal);
        assert!(principal.existe);
        assert_eq!(principal.caminho.to_lowercase(), normalizar(&raiz).to_lowercase());
    }

    #[test]
    fn pasta_que_nao_e_git() {
        // A pasta temporária pode estar dentro de um repositório (o da pasta do usuário, por exemplo):
        // a do Windows, não.
        let locais = listar(&std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".into())).unwrap();
        assert!(!locais.eh_git);
    }

    #[test]
    fn subpasta_do_app_no_repositorio() {
        assert_eq!(subpasta("D:\\proj\\app", "D:/proj/app/").as_deref(), Some(""));
        assert_eq!(subpasta("d:\\PROJ\\app\\web", "D:\\proj\\app").as_deref(), Some("web"));
        assert_eq!(subpasta("D:\\proj\\app-2", "D:\\proj\\app"), None);
        assert_eq!(juntar("D:\\w\\x", "web"), "D:\\w\\x\\web");
    }

    #[test]
    fn nome_de_pasta_da_branch() {
        assert_eq!(nome_de_pasta("feat/painel-x"), "feat-painel-x");
        assert_eq!(nome_de_pasta("fix/acentuação"), "fix-acentua--o");
    }
}
