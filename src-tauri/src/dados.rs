//! Os dados do launcher ficam em %APPDATA%\br.com.viniciusventura.launcher: o launcher.json
//! (grupos, apps e variações) e a pasta imagens\ com as fotos. O Rust não interpreta o JSON: quem
//! conhece o formato é a interface (src/lib/tipos.ts).
//!
//! Para testar sem tocar nos dados de verdade (o launcher instalado pode estar aberto, gravando o
//! mesmo arquivo), a variável LAUNCHER_DADOS aponta para outra pasta.

use std::fs;
use std::path::{Path, PathBuf};
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Manager};

const ARQUIVO: &str = "launcher.json";
const EXTENSOES: [&str; 7] = ["png", "jpg", "jpeg", "webp", "gif", "avif", "svg"];
const TAMANHO_MAXIMO: u64 = 20 * 1024 * 1024;

/// A pasta escolhida pela LAUNCHER_DADOS, se houver.
pub fn pasta_de_teste() -> Option<PathBuf> {
    std::env::var_os("LAUNCHER_DADOS").filter(|v| !v.is_empty()).map(PathBuf::from)
}

fn pasta_dados(app: &AppHandle) -> Result<PathBuf, String> {
    let pasta = match pasta_de_teste() {
        Some(pasta) => pasta,
        None => app.path().app_data_dir().map_err(|e| e.to_string())?,
    };
    fs::create_dir_all(pasta.join("imagens")).map_err(|e| e.to_string())?;
    Ok(pasta)
}

#[tauri::command]
pub fn caminho_dados(app: AppHandle) -> Result<String, String> {
    pasta_dados(&app).map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn carregar_config(app: AppHandle) -> Result<Option<serde_json::Value>, String> {
    let caminho = pasta_dados(&app)?.join(ARQUIVO);
    if !caminho.exists() {
        return Ok(None);
    }
    let texto = fs::read_to_string(&caminho).map_err(|e| e.to_string())?;
    serde_json::from_str(&texto).map(Some).map_err(|e| format!("O {ARQUIVO} está corrompido: {e}"))
}

/// Grava num arquivo temporário e troca de uma vez, guardando a versão anterior no .bak.
#[tauri::command]
pub fn salvar_config(app: AppHandle, config: serde_json::Value) -> Result<(), String> {
    let pasta = pasta_dados(&app)?;
    let caminho = pasta.join(ARQUIVO);
    let temporario = pasta.join(format!("{ARQUIVO}.tmp"));
    let texto = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&temporario, texto).map_err(|e| e.to_string())?;
    if caminho.exists() {
        let _ = fs::copy(&caminho, pasta.join(format!("{ARQUIVO}.bak")));
    }
    fs::rename(&temporario, &caminho).map_err(|e| e.to_string())
}

fn novo_nome(extensao: &str) -> String {
    let agora = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    format!("{agora:x}.{extensao}")
}

fn extensao_valida(extensao: &str) -> Result<String, String> {
    let e = extensao.trim_start_matches('.').to_lowercase();
    if EXTENSOES.contains(&e.as_str()) {
        Ok(e)
    } else {
        Err(format!("Formato .{e} não aceito. Use {}.", EXTENSOES.join(", ")))
    }
}

/// Copia a imagem escolhida para a pasta de imagens e devolve o nome do arquivo novo.
#[tauri::command]
pub fn importar_imagem(app: AppHandle, origem: String) -> Result<String, String> {
    let origem = PathBuf::from(origem);
    let extensao = extensao_valida(&origem.extension().map(|e| e.to_string_lossy().into_owned()).unwrap_or_default())?;
    let tamanho = fs::metadata(&origem).map_err(|e| e.to_string())?.len();
    if tamanho > TAMANHO_MAXIMO {
        return Err("A imagem passa de 20 MB.".into());
    }
    let nome = novo_nome(&extensao);
    fs::copy(&origem, pasta_dados(&app)?.join("imagens").join(&nome)).map_err(|e| e.to_string())?;
    Ok(nome)
}

/// A imagem colada (Ctrl+V de um print): chega como bytes, com a extensão no cabeçalho.
#[tauri::command]
pub fn importar_imagem_colada(app: AppHandle, request: Request<'_>) -> Result<String, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("A imagem não chegou como bytes.".into());
    };
    if bytes.len() as u64 > TAMANHO_MAXIMO {
        return Err("A imagem passa de 20 MB.".into());
    }
    let extensao = extensao_valida(request.headers().get("extensao").and_then(|v| v.to_str().ok()).unwrap_or("png"))?;
    let nome = novo_nome(&extensao);
    fs::write(pasta_dados(&app)?.join("imagens").join(&nome), bytes).map_err(|e| e.to_string())?;
    Ok(nome)
}

/// As pastas do usuário onde as fotos costumam estar, inclusive as que o OneDrive levou.
fn pastas_do_usuario() -> Vec<PathBuf> {
    let mut lista = Vec::new();
    if let Some(casa) = std::env::var_os("USERPROFILE").map(PathBuf::from) {
        lista.extend(["Downloads", "Pictures", "Desktop", "Documents"].map(|p| casa.join(p)));
    }
    if let Some(nuvem) = std::env::var_os("OneDrive").map(PathBuf::from) {
        lista.extend(["Imagens", "Pictures", "Área de Trabalho", "Desktop", "Documentos", "Documents"].map(|p| nuvem.join(p)));
    }
    lista.into_iter().filter(|p| p.is_dir()).collect()
}

/// Pastas que nunca guardam a foto escolhida e só atrasam a busca.
const PULAR: [&str; 8] = ["node_modules", "target", "dist", "build", "venv", "__pycache__", "AppData", "vendor"];
/// Quantos arquivos e pastas a busca olha no máximo, somando todas as pastas.
const MAXIMO_VISITADOS: usize = 300_000;

/// Um arquivo de imagem igual a `alvo` (mesmo tamanho e mesmo conteúdo) dentro de `raiz`, até a
/// `profundidade` dada. Sem seguir atalhos de pasta, sem pastas ocultas.
fn procurar_igual(raiz: &Path, profundidade: usize, alvo: &[u8], visitados: &mut usize) -> Option<PathBuf> {
    let mut pilha = vec![(raiz.to_path_buf(), 0usize)];
    while let Some((pasta, nivel)) = pilha.pop() {
        let Ok(entradas) = fs::read_dir(&pasta) else { continue };
        for entrada in entradas.flatten() {
            *visitados += 1;
            if *visitados > MAXIMO_VISITADOS {
                return None;
            }
            let Ok(tipo) = entrada.file_type() else { continue };
            let nome = entrada.file_name().to_string_lossy().into_owned();
            if tipo.is_dir() {
                if nivel < profundidade && !nome.starts_with('.') && !PULAR.contains(&nome.as_str()) {
                    pilha.push((entrada.path(), nivel + 1));
                }
                continue;
            }
            let eh_imagem = Path::new(&nome)
                .extension()
                .is_some_and(|e| EXTENSOES.contains(&e.to_string_lossy().to_lowercase().as_str()));
            if tipo.is_file()
                && eh_imagem
                && entrada.metadata().is_ok_and(|m| m.len() == alvo.len() as u64)
                && fs::read(entrada.path()).is_ok_and(|bytes| bytes == alvo)
            {
                return Some(entrada.path());
            }
        }
    }
    None
}

/// De onde veio uma foto escolhida antes de o launcher guardar a origem: o arquivo igual à cópia dela,
/// procurado nas pastas dadas (a do app, a do grupo) e depois nas do usuário (Downloads, Imagens, Área
/// de Trabalho, Documentos). None se não achar.
#[tauri::command]
pub async fn localizar_origem(app: AppHandle, nome: String, dicas: Vec<String>) -> Result<Option<String>, String> {
    if nome.contains(['/', '\\']) || nome.contains("..") {
        return Err("Nome de imagem inválido.".into());
    }
    let copia = pasta_dados(&app)?.join("imagens").join(&nome);
    tauri::async_runtime::spawn_blocking(move || {
        let alvo = fs::read(&copia).map_err(|e| format!("Não consegui ler a foto: {e}"))?;
        let mut raizes: Vec<(PathBuf, usize)> = dicas.iter().map(|d| (PathBuf::from(d), 6)).filter(|(p, _)| p.is_dir()).collect();
        raizes.extend(pastas_do_usuario().into_iter().map(|p| (p, 4)));
        let mut visitados = 0;
        Ok(raizes
            .iter()
            .find_map(|(raiz, profundidade)| procurar_igual(raiz, *profundidade, &alvo, &mut visitados))
            .map(|p| p.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn remover_imagem(app: AppHandle, nome: String) -> Result<(), String> {
    if nome.contains(['/', '\\']) || nome.contains("..") {
        return Err("Nome de imagem inválido.".into());
    }
    let caminho = pasta_dados(&app)?.join("imagens").join(nome);
    if caminho.exists() {
        fs::remove_file(caminho).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn acha_a_foto_igual_e_ignora_as_parecidas() {
        let raiz = std::env::temp_dir().join(format!("vlauncher-origem-{}", std::process::id()));
        let _ = fs::remove_dir_all(&raiz);
        let fundo = raiz.join("projeto").join("public").join("img");
        fs::create_dir_all(&fundo).unwrap();
        fs::create_dir_all(raiz.join("node_modules").join("pacote")).unwrap();
        // Mesmo tamanho e conteúdo diferente, e uma cópia igual dentro de node_modules: nenhuma vale.
        fs::write(fundo.join("outra.png"), b"PNG-B").unwrap();
        fs::write(raiz.join("node_modules").join("pacote").join("logo.png"), b"PNG-A").unwrap();
        fs::write(fundo.join("Logo.PNG"), b"PNG-A").unwrap();
        let mut visitados = 0;
        let achada = procurar_igual(&raiz, 6, b"PNG-A", &mut visitados);
        assert_eq!(achada, Some(fundo.join("Logo.PNG")));
        // Fundo demais para a profundidade dada.
        assert_eq!(procurar_igual(&raiz, 2, b"PNG-A", &mut visitados), None);
        let _ = fs::remove_dir_all(&raiz);
    }
}
