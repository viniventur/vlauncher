// Criar ou editar um subgrupo: o nome, os apps (os do grupo que não estão noutro subgrupo) na ordem em
// que sobem no "rodar tudo", e, ao editar, o grupo e o desfazer. Criando, as sugestões (os repositórios
// que moram na mesma pasta) preenchem tudo com um clique.

import { ArrowDown, ArrowUp, LayoutGrid, Plus, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { api } from '../lib/api'
import { useConfig } from '../lib/config'
import { acharSubgrupo, subgruposValidos, sugestoesDeSubgrupos } from '../lib/subgrupos'
import type { App } from '../lib/tipos'
import { useUi } from '../lib/ui'
import { Capa } from './Capa'
import { Dialogo } from './Dialogo'

interface Props {
  /** Editando: o subgrupo. */
  id?: string
  /** Criando: o grupo. */
  grupoId?: string
}

export function DialogoSubgrupo({ id, grupoId }: Props) {
  const config = useConfig((s) => s.config)
  const { criarSubgrupo, editarSubgrupo, moverSubgrupo, desfazerSubgrupo } = useConfig.getState()
  const { abrirDialogo, abrirSubgrupo } = useUi.getState()
  const achado = useMemo(() => acharSubgrupo(config, id), [config, id])
  const grupo = achado?.grupo ?? config.grupos.find((g) => g.id === grupoId)

  const [nome, setNome] = useState(achado?.subgrupo.nome ?? '')
  const [apps, setApps] = useState<string[]>(achado?.subgrupo.apps ?? [])
  const [destino, setDestino] = useState(grupo?.id ?? '')

  // Os apps que podem entrar: os do grupo que não estão noutro subgrupo.
  const disponiveis = useMemo(() => {
    if (!grupo) return []
    const noutros = new Set(subgruposValidos(grupo).filter((s) => s.id !== id).flatMap((s) => s.apps))
    return grupo.apps.filter((a) => !noutros.has(a.id))
  }, [grupo, id])
  const porId = new Map(disponiveis.map((a) => [a.id, a]))
  const escolhidos = apps.map((x) => porId.get(x)).filter((a): a is App => Boolean(a))
  const fora = disponiveis.filter((a) => !apps.includes(a.id))
  const sugestoes = useMemo(() => (grupo && !achado ? sugestoesDeSubgrupos(grupo) : []), [grupo, achado])

  if (!grupo) return null
  const fechar = () => abrirDialogo(null)
  const valido = nome.trim() && escolhidos.length >= 2

  const salvar = () => {
    if (!valido) return
    const dados = { nome: nome.trim(), apps: escolhidos.map((a) => a.id) }
    if (achado) {
      editarSubgrupo(achado.subgrupo.id, dados)
      if (destino && destino !== grupo.id) moverSubgrupo(achado.subgrupo.id, destino)
      fechar()
    } else {
      const novo = criarSubgrupo(grupo.id, dados)
      fechar()
      abrirSubgrupo(novo)
    }
  }

  const desfazer = async () => {
    if (!achado) return
    const aviso = `O subgrupo ${achado.subgrupo.nome} se desfaz, e os apps dele voltam soltos para o grupo ${grupo.nome}.`
    if (await api.confirmar(aviso, 'Desfazer o subgrupo', 'Desfazer')) {
      desfazerSubgrupo(achado.subgrupo.id)
      abrirSubgrupo(null)
      fechar()
    }
  }

  const mover = (indice: number, passo: -1 | 1) => {
    const nova = escolhidos.map((a) => a.id)
    const [item] = nova.splice(indice, 1)
    nova.splice(indice + passo, 0, item!)
    setApps(nova)
  }

  return (
    <Dialogo
      titulo={achado ? 'Editar o subgrupo' : 'Novo subgrupo'}
      subtitulo={`Os apps de ${grupo.nome} que formam um sistema (o front e a API, por exemplo). Na galeria, eles ficam juntos, como numa pasta; cada um segue com a sua worktree.`}
      aoFechar={fechar}
      aoEnviar={salvar}
      largura="38rem"
      rodape={
        <>
          {achado && (
            <button type="button" className="botao-2 pequeno mr-auto border-transparent text-erro hover:border-current" onClick={desfazer}>
              <Trash2 className="size-3.5" /> Desfazer o subgrupo
            </button>
          )}
          <button type="button" className="botao-2 ml-auto" onClick={fechar}>
            Cancelar
          </button>
          <button type="submit" className="botao" disabled={!valido}>
            {achado ? 'Salvar' : 'Criar subgrupo'}
          </button>
        </>
      }
    >
      <div className="grid gap-5">
        {sugestoes.length > 0 && (
          <div>
            <span className="rotulo">Sugestões (repositórios na mesma pasta)</span>
            <div className="flex flex-wrap gap-2">
              {sugestoes.map((s) => (
                <button
                  key={s.nome}
                  type="button"
                  className="botao-2 pequeno"
                  onClick={() => {
                    setNome(s.nome)
                    setApps(s.apps)
                  }}
                >
                  <LayoutGrid className="size-3.5" /> {s.nome}
                  <span className="font-normal text-texto-3">{s.apps.map((x) => porId.get(x)?.nome).join(' + ')}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="block">
          <span className="rotulo">Nome</span>
          <input className="campo" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="loja" required />
        </label>

        <div>
          <span className="rotulo">Apps, na ordem em que sobem no rodar tudo (a API antes do front)</span>
          {escolhidos.length === 0 ? (
            <p className="text-apoio text-texto-3">Escolha dois ou mais apps abaixo.</p>
          ) : (
            <ol className="grid gap-1.5">
              {escolhidos.map((app, i) => (
                <li key={app.id} className="flex items-center gap-3 rounded-md bg-superficie px-2.5 py-1.5">
                  <span className="w-4 text-right text-legenda text-texto-3">{i + 1}</span>
                  <Capa nome={app.nome} imagem={app.imagem} ajuste={app.ajuste} tamanho="pequena" className="aspect-[16/10] w-10 shrink-0 rounded-[4px]" />
                  <span className="min-w-0 flex-1 truncate font-semibold">{app.nome}</span>
                  <button
                    type="button"
                    className="icone-botao pequeno"
                    disabled={i === 0}
                    onClick={() => mover(i, -1)}
                    aria-label={`Subir ${app.nome}`}
                    title="Subir"
                  >
                    <ArrowUp className="size-4" />
                  </button>
                  <button
                    type="button"
                    className="icone-botao pequeno"
                    disabled={i === escolhidos.length - 1}
                    onClick={() => mover(i, 1)}
                    aria-label={`Descer ${app.nome}`}
                    title="Descer"
                  >
                    <ArrowDown className="size-4" />
                  </button>
                  <button
                    type="button"
                    className="icone-botao pequeno"
                    onClick={() => setApps((lista) => lista.filter((x) => x !== app.id))}
                    aria-label={`Tirar ${app.nome}`}
                    title="Tirar do subgrupo"
                  >
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ol>
          )}
          {fora.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {fora.map((app) => (
                <button
                  key={app.id}
                  type="button"
                  onClick={() => setApps([...escolhidos.map((a) => a.id), app.id])}
                  className="flex items-center gap-1.5 rounded-full border border-dashed border-linha px-2.5 py-0.5 text-legenda text-texto-2 transition-colors hover:border-texto-3 hover:text-texto"
                >
                  <Plus className="size-3" /> {app.nome}
                </button>
              ))}
            </div>
          )}
        </div>

        {achado && config.grupos.length > 1 && (
          <label className="block">
            <span className="rotulo">Grupo</span>
            <select className="campo" value={destino} onChange={(e) => setDestino(e.target.value)}>
              {config.grupos.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nome}
                </option>
              ))}
            </select>
            <span className="mt-1.5 block text-legenda text-texto-3">Trocar o grupo leva os apps do subgrupo junto.</span>
          </label>
        )}
      </div>
    </Dialogo>
  )
}
