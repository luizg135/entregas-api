// Arquivo: api/dados.js
// CÓDIGO COMPLETO E FINAL
// Lógica atualizada para associar "Outras Formações" diretamente aos cursos existentes.

// --- FUNÇÕES UTILITÁRIAS ---

function excelDateToJSDate(excelDate) {
  if (!excelDate || typeof excelDate !== 'number' || excelDate < 1) return null;
  const date = new Date((excelDate - 25569) * 86400 * 1000);
  date.setMinutes(date.getMinutes() + date.getTimezoneOffset());
  return date;
}

function getPersonNameFromFile(filename = "") {
    return filename
        .replace("Checklist de Entregas - ", "")
        .replace("Outras Atividades - ", "")
        .replace(".xlsx", "")
        .trim();
}

const pedagogueNameMap = {
    "Josimeri": "Josimeri Grein", "Leandro": "Leandro Prado", "Enderson": "Enderson Lopes",
    "Regiane": "Regiane Hornung", "Marcia": "Marcia Salles"
};

const normalizePedagogueName = (name) => pedagogueNameMap[name] || name;

// --- FUNÇÕES DE PROCESSAMENTO DE DADOS ---

function processarChecklist(checklist = []) {
    return checklist
        .filter(curso => curso.Curso && curso.Curso.trim() !== "")
        .map((curso, index) => {
            const dataCampo = excelDateToJSDate(curso["Disponível a campo"]);
            return {
              id: `CURSO_${index + 1}`,
              nome: curso.Curso,
              nivel: curso.Nível,
              tipo: curso.Tipo,
              pedagogo: normalizePedagogueName(curso.Pedagogo),
              dataDisponivel: dataCampo,
              anoDisponivel: dataCampo ? dataCampo.getFullYear() : null,
              trimestreDisponivel: dataCampo ? Math.ceil((dataCampo.getMonth() + 1) / 3) : null,
              conclusao: parseFloat(curso.Conclusão || 0),
              indicadorReal: parseFloat(curso.Indicador || 0),
              etapaAtual: curso["Etapa Atual"],
              tecnico: getPersonNameFromFile(curso.filename),
              pilotoInicio: excelDateToJSDate(curso["Curso Piloto (Início)"]),
              pilotoFim: excelDateToJSDate(curso["Curso Piloto (Final)"]),
              formacaoInicio: excelDateToJSDate(curso["Formação (Início)"]),
              formacaoFim: excelDateToJSDate(curso["Formação (Final)"]),
            };
        });
}

function processarOutrasFormacoes(outrasFormacoes = []) {
    return outrasFormacoes.map(formacao => ({
        curso: formacao.Curso,
        nivel: formacao.Nível,
        tipo: formacao.Tipo,
        pedagogo: normalizePedagogueName(formacao.Pedagogo),
        inicio: excelDateToJSDate(formacao["Início (Data)"]),
        fim: excelDateToJSDate(formacao["Final (Data)"]),
        tecnico: getPersonNameFromFile(formacao.filename),
    }));
}

function processarEventos(eventos = []) {
    return eventos.map(evento => ({
        tema: evento.Tema,
        tipo: evento.Tipo,
        estilo: evento.Estilo,
        inicio: excelDateToJSDate(evento["Início (Data)"]),
        fim: excelDateToJSDate(evento["Final (Data)"]),
        tecnico: getPersonNameFromFile(evento.filename),
    }));
}

function processarOutrasAtividades(outrasAtividades = [], pedagogosPrincipais = []) {
    const atividadesProcessadas = { pedagogos: [], tecnicos: [] };
    outrasAtividades.forEach(atividade => {
        const pessoa = getPersonNameFromFile(atividade.filename);
        const inicio = excelDateToJSDate(atividade["Início (Data)"]);
        const itemProcessado = {
            tipo: atividade.Tipo,
            tema: atividade.Tema,
            inicio: inicio ? inicio.toISOString().split('T')[0] : null,
            fim: excelDateToJSDate(atividade["Final (Data)"])?.toISOString().split('T')[0] || null,
            responsavel: pessoa,
            ano: inicio ? inicio.getFullYear() : null
        };
        if (pedagogosPrincipais.includes(pessoa)) {
            atividadesProcessadas.pedagogos.push(itemProcessado);
        } else {
            atividadesProcessadas.tecnicos.push(itemProcessado);
        }
    });
    return atividadesProcessadas;
}


// --- FUNÇÕES DE ANÁLISE E FORMATAÇÃO ---

const gerarVisaoGeral = (cursosLimpos) => {
    const dataFiltrada = cursosLimpos;
    const metaEntregas = dataFiltrada.length;
    const novos = dataFiltrada.filter(c => c.tipo === 'Curso novo');
    const atualizacoes = dataFiltrada.filter(c => c.tipo === 'Atualização');
    const novosEntregues = novos.filter(c => c.etapaAtual === 'Entregue').length;
    const atualizacoesEntregues = atualizacoes.filter(c => c.etapaAtual === 'Entregue').length;

    const mapaEtapas = { "Prospecção e Contratação de Especialistas": "Etapa 1", "Edital de Credenciamento": "Etapa 2", "Curso Piloto": "Etapa 3", "Formação de Instrutores": "Etapa 4", "Entrega Técnica": "Etapa 5", "Lançamento a Campo": "Etapa 6", "Entregue": "Entregue" };
    const cursosPorEtapa = dataFiltrada.reduce((acc, c) => { const etapa = mapaEtapas[c.etapaAtual] || "Outra"; acc[etapa] = (acc[etapa] || 0) + 1; return acc; }, {});
    const entregasPorTrimestre = dataFiltrada.reduce((acc, c) => { if (c.trimestreDisponivel) { acc[`T${c.trimestreDisponivel}`] = (acc[`T${c.trimestreDisponivel}`] || 0) + 1; } return acc; }, {});
    const cursosPorNivel = dataFiltrada.reduce((acc, c) => { const nivel = c.nivel || "Não definido"; acc[nivel] = (acc[nivel] || 0) + 1; return acc; }, {});

    const proximosLancamentos = cursosLimpos
        .filter(c => c.dataDisponivel && c.dataDisponivel >= new Date() && c.etapaAtual !== 'Entregue')
        .sort((a,b) => a.dataDisponivel - b.dataDisponivel)
        .slice(0, 10)
        .map(c => ({
            nome: c.nome,
            nivel: c.nivel,
            dataLancamento: c.dataDisponivel.toISOString().split('T')[0]
        }));

    return {
      indicadores: {
        metaEntregas,
        novos: { entregues: novosEntregues, total: novos.length },
        atualizacoes: { entregues: atualizacoesEntregues, total: atualizacoes.length }
      },
      graficos: {
        cursosPorEtapa,
        entregasTrimestrais: entregasPorTrimestre,
        cursosPorNivel
      },
      proximosLancamentos
    };
}

// ATUALIZADO: Função agora associa as formações extras
const formatarCursosParaLista = (cursosLimpos, formacoesLimpas) => {
    return cursosLimpos.map(curso => {
        const eventosAssociados = [];
        // 1. Adiciona piloto e formação do próprio checklist
        if (curso.pilotoInicio) {
            eventosAssociados.push({
                tipo: "Piloto",
                inicio: curso.pilotoInicio.toISOString().split('T')[0],
                fim: curso.pilotoFim ? curso.pilotoFim.toISOString().split('T')[0] : curso.pilotoInicio.toISOString().split('T')[0],
                pedagogo: curso.pedagogo
            });
        }
        if (curso.formacaoInicio) {
            eventosAssociados.push({
                tipo: "Formação",
                inicio: curso.formacaoInicio.toISOString().split('T')[0],
                fim: curso.formacaoFim ? curso.formacaoFim.toISOString().split('T')[0] : curso.formacaoInicio.toISOString().split('T')[0],
                pedagogo: curso.pedagogo
            });
        }

        // 2. Procura e adiciona formações extras da outra planilha
        const formacoesExtras = formacoesLimpas.filter(f => f.curso.trim() === curso.nome.trim());
        formacoesExtras.forEach(f => {
            if (f.inicio) {
                eventosAssociados.push({
                    tipo: "Formação", // Nomenclatura unificada
                    inicio: f.inicio.toISOString().split('T')[0],
                    fim: f.fim ? f.fim.toISOString().split('T')[0] : f.inicio.toISOString().split('T')[0],
                    pedagogo: f.pedagogo // Pedagogo específico daquela formação
                });
            }
        });

        return {
            id: curso.id,
            nome: curso.nome,
            nivel: curso.nivel,
            tipo: curso.tipo,
            anoDisponivel: curso.anoDisponivel,
            dataDisponivel: curso.dataDisponivel ? curso.dataDisponivel.toISOString().split('T')[0] : null,
            etapaAtual: curso.etapaAtual,
            indicadorReal: curso.indicadorReal,
            equipe: {
                pedagogo: curso.pedagogo,
                tecnico: curso.tecnico
            },
            eventosAssociados: eventosAssociados.sort((a,b) => new Date(a.inicio) - new Date(b.inicio)) // Ordena os eventos
        };
    });
}

function gerarCalendarioEventos(cursos, formacoes, eventos) {
    const calendario = [];
    const pedagogoCores = {
        "Josimeri Grein": '#ec4899', // Rosa
        "Enderson Lopes": '#f97316', // Laranja
        "Leandro Prado": '#3b82f6',  // Azul
        "Regiane Hornung": '#8b5cf6',// Roxo
        "Marcia Salles": '#eab308',  // Amarelo
        "default": '#6b7280'         // Cinza
    };
    const corEvento = '#22c55e'; // Verde

    const getCorPorPedagogo = (nome) => pedagogoCores[nome] || pedagogoCores.default;

    cursos.forEach(c => {
        if (c.pilotoInicio) {
            calendario.push({
                titulo: `Piloto: ${c.nome}`,
                dataInicio: c.pilotoInicio.toISOString().split('T')[0],
                dataFim: c.pilotoFim ? c.pilotoFim.toISOString().split('T')[0] : c.pilotoInicio.toISOString().split('T')[0],
                cor: getCorPorPedagogo(c.pedagogo),
                tipo: 'Piloto',
                propriedades: { cursoId: c.id, nomeCurso: c.nome, nivelCurso: c.nivel, pedagogo: c.pedagogo, tecnico: c.tecnico }
            });
        }
        if (c.formacaoInicio) {
             calendario.push({
                titulo: `Formação: ${c.nome}`,
                dataInicio: c.formacaoInicio.toISOString().split('T')[0],
                dataFim: c.formacaoFim ? c.formacaoFim.toISOString().split('T')[0] : c.formacaoInicio.toISOString().split('T')[0],
                cor: getCorPorPedagogo(c.pedagogo),
                tipo: 'Formação',
                propriedades: { cursoId: c.id, nomeCurso: c.nome, nivelCurso: c.nivel, pedagogo: c.pedagogo, tecnico: c.tecnico }
            });
        }
    });

    formacoes.forEach(f => {
        if (f.inicio) {
            calendario.push({
                titulo: `Formação: ${f.curso}`,
                dataInicio: f.inicio.toISOString().split('T')[0],
                dataFim: f.fim ? f.fim.toISOString().split('T')[0] : f.inicio.toISOString().split('T')[0],
                cor: getCorPorPedagogo(f.pedagogo),
                tipo: 'Formação',
                propriedades: { nomeCurso: f.curso, nivelCurso: f.nivel, pedagogo: f.pedagogo, tecnico: f.tecnico }
            });
        }
    });

    eventos.forEach(e => {
        if (e.inicio) {
            calendario.push({
                titulo: `${e.tipo}: ${e.tema}`,
                dataInicio: e.inicio.toISOString().split('T')[0],
                dataFim: e.fim ? e.fim.toISOString().split('T')[0] : e.inicio.toISOString().split('T')[0],
                cor: corEvento,
                tipo: `Evento ${e.estilo === 'Externa' ? 'Externo' : 'Interno'}`,
                propriedades: { responsavel: e.tecnico }
            });
        }
    });

    return calendario.sort((a,b) => new Date(a.dataInicio) - new Date(b.dataInicio));
}


// --- HANDLER PRINCIPAL DA API ---

export default async function handler(request, response) {
  const anoQuery = request.query.ano;
  const ano = anoQuery ? parseInt(anoQuery) : null;

  const googleDriveUrl = "https://drive.google.com/uc?export=download&id=1p-hxGxOqDmsq-Z583mL57vXZShqdn-3u";
  const pedagogosPrincipais = ["Josimeri Grein", "Leandro Prado", "Enderson Lopes"];

  try {
    const fileResponse = await fetch(googleDriveUrl);
    if (!fileResponse.ok) throw new Error(`Erro ao buscar do Google Drive: ${fileResponse.statusText}`);
    const dadosBrutos = await fileResponse.json();

    let cursosLimpos = processarChecklist(dadosBrutos.checklist);
    let formacoesLimpas = processarOutrasFormacoes(dadosBrutos.outrasFormacoes);
    let eventosLimpos = processarEventos(dadosBrutos.eventos);
    let atividadesExtras = processarOutrasAtividades(dadosBrutos.outrasAtividades, pedagogosPrincipais);

    if (ano) {
      cursosLimpos = cursosLimpos.filter(c => c.anoDisponivel === ano);
      formacoesLimpas = formacoesLimpas.filter(f => f.inicio && f.inicio.getFullYear() === ano);
      eventosLimpos = eventosLimpos.filter(e => e.inicio && e.inicio.getFullYear() === ano);
      atividadesExtras.pedagogos = atividadesExtras.pedagogos.filter(a => a.ano === ano);
      atividadesExtras.tecnicos = atividadesExtras.tecnicos.filter(a => a.ano === ano);
    }

    const visaoGeral = gerarVisaoGeral(cursosLimpos);
    // ATUALIZADO: Passa as formacoesLimpas para a função de formatação
    const listaCursos = formatarCursosParaLista(cursosLimpos, formacoesLimpas);
    const calendarioEventos = gerarCalendarioEventos(cursosLimpos, formacoesLimpas, eventosLimpos);

    const dashboardData = {
      anoFiltrado: ano || 'Geral',
      gerado_em: new Date().toISOString(),
      visaoGeral,
      cursos: listaCursos,
      calendarioEventos,
      atividadesExtras
    };

    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    return response.status(200).json(dashboardData);

  } catch (error) {
    console.error("Erro na API:", error);
    return response.status(500).json({ error: error.message, stack: error.stack });
  }
}
