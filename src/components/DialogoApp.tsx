// Criar ou editar um app: a pasta (o launcher lê o package.json e sugere as variações), nome, grupo,
// foto e as variações (o comando, o endereço fixo, as variáveis de ambiente e onde rodar).

import { ChevronDown, FolderOpen, Plus, Star, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { avisarErro } from '../lib/avisos'
import { acharApp, useConfig } from '../lib/config'
import { descartarDoApp } from '../lib/execucoes'
import { novoId } from '../lib/ids'
import { descreverProjeto, escolherSugestoes, variacaoDe } from '../lib/projetos'
import { caminhoWindows, escreverEnv, lerEnv, nomeDaPasta } from '../lib/texto'
import type { Projeto, Sugestao, Variacao } from '../lib/tipos'
import { useUi } from '../lib/ui'
import { CampoImagem } from './CampoImagem'
import { Dialogo } from './Dialogo'

interface Props {
  id?: string
  grupoId?: string
  /** No app novo: onde o seletor de pasta começa (a pasta do grupo). */
  pasta?: string
}

export function DialogoApp({ id, grupoId: grupoInicial, pasta: pastaDoGrupo }: Props) {
  const grupos = useConfig((s) => s.config.grupos)
  const config = useConfig((s) => s.config)
  const achado = useMemo(() => acharApp(config, id), [config, id])
  const app = achado?.app
  const { criarApp, editarApp, moverApp, removerApp } = useConfig.getState()
  const { abrirDialogo, abrirApp } = useUi.getState()

  const [grupoId, setGrupoId] = useState(achado?.grupo.id ?? grupoInicial ?? grupos[0]?.id ?? '')
  const [pasta, setPasta] = useState(app?.pasta ?? '')
  const [nome, setNome] = useState(app?.nome ?? '')
  const [descricao, setDescricao] = useState(app?.descricao ?? '')
  const [imagem, setImagem] = useState(app?.imagem)
  const [ajuste, setAjuste] = useState(app?.ajuste ?? 'preencher')
  const [variacoes, setVariacoes] = useState<Variacao[]>(app?.variacoes ?? [])
  const [padrao, setPadrao] = useState(app?.variacaoPadrao)
  const [pastaWorktrees, setPastaWorktrees] = useState(app?.pastaWorktrees ?? '')
  const [projeto, setProjeto] = useState<Projeto | null>(null)
  const [lidaDe, setLidaDe] = useState('')
  const [lendo, setLendo] = useState(false)

  const ler = async (p: string, preencher: boolean) => {
    if (!p.trim()) return
    setLidaDe(p.trim())
    setLendo(true)
    try {
      const achadoNaPasta = await api.inspecionarPasta(p.trim())
      setProjeto(achadoNaPasta)
      if (achadoNaPasta && preencher) {
        if (!nome.trim()) setNome(achadoNaPasta.nome)
        if (variacoes.length === 0) setVariacoes(escolherSugestoes(achadoNaPasta).map(variacaoDe))
      }
    } catch (e) {
      avisarErro(e)
    } finally {
      setLendo(false)
    }
  }

  // Editando: lê a pasta só para oferecer os outros scripts do package.json.
  useEffect(() => {
    if (app) ler(app.pasta, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const escolherPasta = async () => {
    try {
      const p = await api.escolherPasta('Pasta do app', pasta || pastaDoGrupo)
      if (!p) return
      setPasta(p)
      if (!nome.trim()) setNome(nomeDaPasta(p))
      await ler(p, true)
    } catch (e) {
      avisarErro(e)
    }
  }

  const fechar = () => {
    if (imagem && imagem !== app?.imagem) api.removerImagem(imagem).catch(() => undefined)
    abrirDialogo(null)
  }

  const valido = nome.trim() && pasta.trim() && grupoId
  const salvar = () => {
    if (!valido) return
    const limpas = variacoes.filter((v) => v.nome.trim() && v.comando.trim()).map((v) => ({ ...v, nome: v.nome.trim(), comando: v.comando.trim() }))
    const dados = {
      nome: nome.trim(),
      descricao: descricao.trim() || undefined,
      pasta: caminhoWindows(pasta),
      imagem,
      ajuste,
      variacoes: limpas,
      variacaoPadrao: limpas.some((v) => v.id === padrao) ? padrao : limpas[0]?.id,
      pastaWorktrees: pastaWorktrees.trim() || undefined,
    }
    if (app) {
      editarApp(app.id, dados)
      moverApp(app.id, grupoId)
      abrirDialogo(null)
    } else {
      const novo = criarApp(grupoId, dados)
      abrirDialogo(null)
      abrirApp(novo)
    }
  }

  const remover = async () => {
    if (!app) return
    if (await api.confirmar(`${app.nome} sai do launcher. A pasta do projeto fica como está.`, 'Remover app', 'Remover')) {
      descartarDoApp(app.id)
      removerApp(app.id)
      abrirApp(null)
      abrirDialogo(null)
    }
  }

  const mudarVariacao = (vid: string, dados: Partial<Variacao>) =>
    setVariacoes((vs) => vs.map((v) => (v.id === vid ? { ...v, ...dados } : v)))
  const adicionar = (s?: Sugestao) => setVariacoes((vs) => [...vs, s ? variacaoDe(s) : variacaoDe({ nome: '', comando: '' })])
  const jaTem = (s: Sugestao) => variacoes.some((v) => v.comando.trim() === s.comando)
  const sugestoes = projeto ? [...projeto.sugestoes, ...projeto.outrosScripts].filter((s) => !jaTem(s)) : []

  return (
    <Dialogo
      titulo={app ? `Editar ${app.nome}` : 'Novo app'}
      aoFechar={fechar}
      aoEnviar={salvar}
      largura="48rem"
      rodape={
        <>
          {app && (
            <button type="button" className="botao-2 pequeno mr-auto border-transparent text-erro hover:border-current" onClick={remover}>
              <Trash2 className="size-3.5" /> Remover
            </button>
          )}
          <button type="button" className="botao-2 ml-auto" onClick={fechar}>
            Cancelar
          </button>
          <button type="submit" className="botao" disabled={!valido}>
            {app ? 'Salvar' : 'Adicionar app'}
          </button>
        </>
      }
    >
      <div className="grid gap-6">
        <div>
          <span className="rotulo">Pasta do projeto</span>
          <div className="flex gap-2">
            <input
              className="campo"
              value={pasta}
              onChange={(e) => setPasta(e.target.value)}
              onBlur={() => pasta.trim() !== lidaDe && ler(pasta, !app)}
              placeholder="D:\projetos\trabalho\loja-online"
              required
            />
            <button type="button" className="botao-2 shrink-0" onClick={escolherPasta}>
              <FolderOpen className="size-4" /> Escolher
            </button>
          </div>
          {lendo && <p className="mt-1.5 text-legenda text-texto-3">Lendo a pasta…</p>}
          {projeto && !lendo && <p className="mt-1.5 text-legenda text-texto-3">{descreverProjeto(projeto) || 'pasta sem package.json'}</p>}
        </div>

        <div className="grid grid-cols-[1fr_14rem] gap-4">
          <label className="block">
            <span className="rotulo">Nome</span>
            <input className="campo" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="loja-online" required />
          </label>
          <label className="block">
            <span className="rotulo">Grupo</span>
            <select className="campo" value={grupoId} onChange={(e) => setGrupoId(e.target.value)}>
              {grupos.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nome}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="rotulo">Descrição (opcional)</span>
          <input className="campo" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="O que é, para quem" />
        </label>

        <div>
          <span className="rotulo">Foto</span>
          <CampoImagem nome={nome} imagem={imagem} original={app?.imagem} aoMudar={setImagem} ajuste={ajuste} aoAjustar={setAjuste} />
        </div>

        <div>
          <div className="mb-2 flex items-baseline gap-3">
            <span className="rotulo mb-0 flex-1">Variações</span>
            <span className="text-legenda text-texto-3">A estrela marca a que o ▶ da galeria roda.</span>
          </div>
          <ul className="grid gap-2.5">
            {variacoes.map((v) => (
              <LinhaDeVariacao
                key={v.id}
                variacao={v}
                padrao={(padrao ?? variacoes[0]?.id) === v.id}
                aoMudar={(d) => mudarVariacao(v.id, d)}
                aoMarcarPadrao={() => setPadrao(v.id)}
                aoRemover={() => setVariacoes((vs) => vs.filter((x) => x.id !== v.id))}
              />
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className="botao-2 pequeno" onClick={() => adicionar()}>
              <Plus className="size-3.5" /> Variação
            </button>
            {sugestoes.length > 0 && <span className="ml-2 text-legenda text-texto-3">Do package.json:</span>}
            {sugestoes.slice(0, 14).map((s) => (
              <button
                key={s.comando}
                type="button"
                onClick={() => adicionar(s)}
                className="rounded-full border border-dashed border-linha px-2.5 py-0.5 font-mono text-codigo text-texto-2 transition-colors hover:border-texto-3 hover:text-texto"
              >
                + {s.nome}
              </button>
            ))}
          </div>
        </div>

        <details className="group/det">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-apoio font-semibold text-texto-2">
            <ChevronDown className="size-4 -rotate-90 transition-transform group-open/det:rotate-0" /> Worktrees
          </summary>
          <label className="mt-3 block">
            <span className="rotulo">Onde criar as worktrees novas</span>
            <input className="campo codigo" value={pastaWorktrees} onChange={(e) => setPastaWorktrees(e.target.value)} placeholder=".claude\worktrees" />
            <span className="mt-1.5 block text-legenda text-texto-3">Relativo à pasta do projeto, ou um caminho completo.</span>
          </label>
        </details>
      </div>
    </Dialogo>
  )
}

interface PropsLinha {
  variacao: Variacao
  padrao: boolean
  aoMudar: (dados: Partial<Variacao>) => void
  aoMarcarPadrao: () => void
  aoRemover: () => void
}

function LinhaDeVariacao({ variacao: v, padrao, aoMudar, aoMarcarPadrao, aoRemover }: PropsLinha) {
  const [aberta, setAberta] = useState(Boolean(v.url || v.env.length || v.abrirQuandoPronto || v.noTerminal))
  const [env, setEnv] = useState(escreverEnv(v.env))
  const idBase = v.id || novoId()

  return (
    <li className="rounded-lg border border-linha bg-fundo">
      <div className="flex items-center gap-2 p-2">
        <button
          type="button"
          onClick={aoMarcarPadrao}
          className={`icone-botao pequeno ${padrao ? 'text-destaque hover:text-destaque' : 'text-texto-3'}`}
          title={padrao ? 'Variação padrão' : 'Usar como padrão'}
          aria-pressed={padrao}
          aria-label="Variação padrão"
        >
          <Star className={`size-4 ${padrao ? 'fill-current' : ''}`} />
        </button>
        <input
          className="campo w-36 shrink-0"
          value={v.nome}
          onChange={(e) => aoMudar({ nome: e.target.value })}
          placeholder="dev:all"
          aria-label="Nome da variação"
        />
        <input
          className="campo codigo"
          value={v.comando}
          onChange={(e) => aoMudar({ comando: e.target.value })}
          placeholder="npm run dev:all"
          aria-label="Comando"
        />
        <button
          type="button"
          className="icone-botao pequeno"
          onClick={() => setAberta((a) => !a)}
          aria-expanded={aberta}
          aria-label="Mais opções"
          title="Endereço, variáveis de ambiente e onde rodar"
        >
          <ChevronDown className={`size-4 transition-transform ${aberta ? 'rotate-180' : ''}`} />
        </button>
        <button type="button" className="icone-botao pequeno hover:text-erro" onClick={aoRemover} aria-label="Remover a variação">
          <Trash2 className="size-4" />
        </button>
      </div>
      {aberta && (
        <div className="grid grid-cols-2 gap-4 border-t border-linha px-4 pt-3 pb-4">
          <label className="block">
            <span className="rotulo">Endereço fixo (opcional)</span>
            <input
              className="campo codigo"
              value={v.url ?? ''}
              onChange={(e) => aoMudar({ url: e.target.value || undefined })}
              placeholder="http://localhost:8080"
            />
            <span className="mt-1.5 block text-legenda text-texto-3">Sem ele, vale o endereço que o app anunciar ao subir.</span>
          </label>
          <label className="block">
            <span className="rotulo">Variáveis de ambiente</span>
            <textarea
              className="campo codigo min-h-[4.5rem] resize-y"
              value={env}
              onChange={(e) => {
                setEnv(e.target.value)
                aoMudar({ env: lerEnv(e.target.value) })
              }}
              placeholder={'PORT=3002\nVITE_API_PROXY_TARGET=http://localhost:3002'}
              rows={3}
            />
          </label>
          <label className="col-span-2 flex items-center gap-2.5 text-apoio" htmlFor={`${idBase}-abrir`}>
            <input
              id={`${idBase}-abrir`}
              type="checkbox"
              className="size-4 accent-[var(--destaque)]"
              checked={v.abrirQuandoPronto}
              onChange={(e) => aoMudar({ abrirQuandoPronto: e.target.checked })}
            />
            Abrir no navegador quando o app estiver pronto
          </label>
          <label className="col-span-2 -mt-2 flex items-center gap-2.5 text-apoio" htmlFor={`${idBase}-terminal`}>
            <input
              id={`${idBase}-terminal`}
              type="checkbox"
              className="size-4 accent-[var(--destaque)]"
              checked={v.noTerminal}
              onChange={(e) => aoMudar({ noTerminal: e.target.checked })}
            />
            Rodar no Windows Terminal (a saída fica lá, não aqui)
          </label>
        </div>
      )}
    </li>
  )
}
