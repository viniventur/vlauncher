//! Os dados do launcher ficam em %APPDATA%\br.com.viniciusventura.launcher: o launcher.json
//! (grupos, apps e variações) e a pasta imagens\ com as fotos. O Rust não interpreta o JSON: quem
//! conhece o formato é a interface (src/lib/tipos.ts).
//!
//! Para testar sem tocar nos dados de verdade (o launcher instalado pode estar aberto, gravando o
//! mesmo arquivo), a variável LAUNCHER_DADOS aponta para outra pasta.

use std::fs;
use std::path::PathBuf;
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
