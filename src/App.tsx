import { useEffect } from 'react'
import { Avisos } from './components/Avisos'
import { Busca } from './components/Busca'
import { DialogoApp } from './components/DialogoApp'
import { DialogoContas } from './components/DialogoContas'
import { DialogoGrupo } from './components/DialogoGrupo'
import { DialogoImportar } from './components/DialogoImportar'
import { FundoLiquido } from './components/FundoLiquido'
import { Galeria } from './components/Galeria'
import { Monitor } from './components/Monitor'
import { Painel } from './components/Painel'
import { Topo } from './components/Topo'
import { Vazio } from './components/Vazio'
import { api } from './lib/api'
import { conectarCanal } from './lib/canal'
import { useConfig } from './lib/config'
import { useExecucoes } from './lib/execucoes'
import { useMonitor } from './lib/monitor'
import { ouvirImagensSoltas } from './lib/soltarImagem'
import { useUi } from './lib/ui'
import { TRANSPARENCIA_PADRAO, transparenciaPeloAtalho } from './lib/vidro'

export function App() {
  const pronto = useConfig((s) => s.pronto)
  const erro = useConfig((s) => s.erro)
  const tema = useConfig((s) => s.config.tema)
  const vidro = useConfig((s) => Boolean(s.config.vidro))
  const transparencia = useConfig((s) => s.config.transparencia ?? TRANSPARENCIA_PADRAO)
  const desfoque = useConfig((s) => s.config.desfoque ?? true)
  const temGrupos = useConfig((s) => s.config.grupos.length > 0)
  const dialogo = useUi((s) => s.dialogo)
  const buscaAberta = useUi((s) => s.buscaAberta)

  useEffect(() => {
    // O `vl` só é atendido depois que os apps e as execuções chegam: um pedido que esperava (o vl
    // rodar que abriu o launcher) acharia a lista vazia.
    Promise.all([useConfig.getState().carregar(), useExecucoes.getState().conectar(), useMonitor.getState().conectar()])
      .then(conectarCanal)
      .catch((e) => console.error('o launcher não terminou de carregar', e))
    ouvirImagensSoltas()
    api.aoAbrirBusca(() => useUi.getState().abrirBusca(true))

    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        useUi.getState().abrirBusca(true)
        return
      }
      // A transparência do liquid glass, com os atalhos do Windows Terminal.
      const { config, definirTransparencia } = useConfig.getState()
      if (e.ctrlKey && e.altKey && config.vidro) {
        const nova = transparenciaPeloAtalho(e.code, config.transparencia ?? TRANSPARENCIA_PADRAO)
        if (nova !== null) {
          e.preventDefault()
          definirTransparencia(nova)
        }
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.tema = tema
    api.definirTemaDaJanela(tema).catch(() => undefined)
  }, [tema])

  useEffect(() => {
    if (vidro) document.documentElement.dataset.vidro = ''
    else delete document.documentElement.dataset.vidro
  }, [vidro])

  // A janela é transparente (tauri.conf.json); quem decide quanto se vê atrás dela é o CSS, por esta
  // variável. O acrylic só faz sentido com o vidro ligado, com desfoque e com algo transparente.
  useEffect(() => {
    document.documentElement.style.setProperty('--transparencia', String(transparencia / 100))
  }, [transparencia])
  const acrylic = vidro && desfoque && transparencia > 0
  useEffect(() => {
    api.definirDesfoqueDaJanela(acrylic).catch((e) => console.warn('efeito da janela', e))
    // Sem foco, o Windows trocaria o acrylic por uma cor sólida: enquanto ele estiver ligado, o Rust
    // mantém a moldura "ativa" e a janela fica igual com e sem foco (src-tauri/src/vidro.rs).
    api.manterVidroAtivo(acrylic).catch((e) => console.warn('vidro sem foco', e))
  }, [acrylic])

  if (!pronto) return null

  return (
    <>
      {vidro && <FundoLiquido />}
      <Topo />
      <main className="mx-auto max-w-[90rem] px-12 pt-10 pb-24">
        {erro && (
          <p className="mb-8 rounded-lg border border-erro px-4 py-3 text-apoio text-erro" data-selecionavel>
            Não consegui ler o launcher.json: {erro}. Nada será gravado por cima até ele ser corrigido.
          </p>
        )}
        {temGrupos ? <Galeria /> : <Vazio />}
      </main>
      <Painel />
      <Monitor />

      {dialogo?.tipo === 'grupo' && <DialogoGrupo id={dialogo.id} pasta={dialogo.pasta} depoisImportar={dialogo.depoisImportar} />}
      {dialogo?.tipo === 'app' && <DialogoApp id={dialogo.id} grupoId={dialogo.grupoId} pasta={dialogo.pasta} />}
      {dialogo?.tipo === 'importar' && <DialogoImportar grupoId={dialogo.grupoId} />}
      {dialogo?.tipo === 'contas' && <DialogoContas />}
      {buscaAberta && <Busca />}
      <Avisos />
    </>
  )
}
