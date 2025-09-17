// Arquivo: api/dados.js

function excelDateToJSDate(excelDate) {
  if (!excelDate || typeof excelDate !== 'number' || excelDate < 1) return null;
  const date = new Date((excelDate - 25569) * 86400 * 1000);
  date.setMinutes(date.getMinutes() + date.getTimezoneOffset());
  return date;
}

// VARIÁVEL QUE FALTAVA - ADICIONADA AQUI
const stageNameMapping = { 
  "Prospecção e Contratação de Especialistas": "Etapa 1", 
  "Edital de Credenciamento": "Etapa 2", 
  "Curso Piloto": "Etapa 3", 
  "Formação de Instrutores": "Etapa 4", 
  "Entrega Técnica": "Etapa 5", 
  "Lançamento a Campo": "Etapa 6" 
};

export default async function handler(request, response) {
  const googleDriveUrl = "https://drive.google.com/uc?export=download&id=1p-hxGxOqDmsq-Z583mL57vXZShqdn-3u";

  try {
    const fileResponse = await fetch(googleDriveUrl);
    if (!fileResponse.ok) throw new Error(`Erro ao buscar do Google Drive: ${fileResponse.statusText}`);
    const dadosBrutos = await fileResponse.json();

    const pedagogosPrincipais = ["Enderson Lopes", "Josimeri Grein", "Leandro Prado"];

    const cursosLimpos = dadosBrutos.checklist
      .filter(curso => curso.Curso && curso.Curso.trim() !== "")
      .map(curso => {
        const dataCampo = excelDateToJSDate(curso["Disponível a campo"]);
        return {
          id: `curso_${curso.Curso.replace(/\s/g, '_')}`,
          nome: curso.Curso,
          nivel: curso.Nível,
          tipo: curso.Tipo,
          pedagogo: curso.Pedagogo,
          dataDisponivel: dataCampo,
          anoDisponivel: dataCampo ? dataCampo.getFullYear() : null,
          trimestreDisponivel: dataCampo ? Math.ceil((dataCampo.getMonth() + 1) / 3) : null,
          etapaAtual: curso["Etapa Atual"],
          tecnico: curso.filename.replace("Checklist de Entregas - ", "").replace(".xlsx", ""),
          pilotoInicio: excelDateToJSDate(curso["Curso Piloto (Início)"]),
          pilotoFim: excelDateToJSDate(curso["Curso Piloto (Final)"]),
          formacaoInicio: excelDateToJSDate(curso["Formação (Início)"]),
          formacaoFim: excelDateToJSDate(curso["Formação (Final)"]),
          indicadorCalculado: parseFloat(curso.Indicador || 0),
        };
      });

    const processarEventos = (listaEventos, tipoEvento, tipoNome) => {
        if (!listaEventos || !Array.isArray(listaEventos)) return [];
        return listaEventos
            .filter(e => e.Data)
            .map((evento, index) => {
                const responsavel = evento.filename.replace("Checklist de Entregas - ", "").replace(".xlsx", "");
                const isPedagogo = pedagogosPrincipais.includes(responsavel);
                const cursoAssociado = cursosLimpos.find(c => c.nome === evento.Atividade);
                return {
                    id: `${tipoEvento}_${index}`,
                    title: evento.Atividade,
                    startDate: excelDateToJSDate(evento.Data),
                    endDate: excelDateToJSDate(evento["Data Final (se houver)"]) || excelDateToJSDate(evento.Data),
                    type: tipoNome + (isPedagogo ? '_pedagogo' : '_tecnico'),
                    owner: responsavel,
                    course: cursoAssociado || null
                };
            });
    };

    const outrasAtividadesEventos = processarEventos(dadosBrutos.outrasAtividades, 'atv', 'atividade');
    const outrasFormacoesEventos = processarEventos(dadosBrutos.outrasFormacoes, 'form', 'formacao_extra');

    const eventosDeCursos = cursosLimpos
        .flatMap(c => ([
            c.pilotoInicio ? { id: c.id, title: `(P) ${c.nome}`, startDate: c.pilotoInicio, endDate: c.pilotoFim || c.pilotoInicio, type: 'piloto', owner: c.tecnico, course: c } : null,
            c.formacaoInicio ? { id: c.id, title: `(F) ${c.nome}`, startDate: c.formacaoInicio, endDate: c.formacaoFim || c.formacaoInicio, type: 'formacao', owner: c.tecnico, course: c } : null,
        ]))
        .filter(Boolean);

    const eventosCalendario = [...eventosDeCursos, ...outrasAtividadesEventos, ...outrasFormacoesEventos];

    const gerarAnalise = (year) => {
        const data = (year === 'Total') ? cursosLimpos : cursosLimpos.filter(c => c.anoDisponivel === year);
        const novos = data.filter(c => c.tipo === 'Curso novo');
        const atualizacoes = data.filter(c => c.tipo === 'Atualização');
        return {
            metaEntregas: data.length,
            totalEntregas: { totalNovos: novos.length, totalAtualizacoes: atualizacoes.length, novosEntregues: novos.filter(c=>c.etapaAtual === 'Entregue').length, atualizacoesEntregues: atualizacoes.filter(c=>c.etapaAtual === 'Entregue').length },
            cursosPorEtapa: data.reduce((acc, c) => { const e = stageNameMapping[c.etapaAtual] || "Outra"; acc[e] = (acc[e] || 0) + 1; return acc; }, {}),
            planejamentoTrimestral: data.reduce((acc, c) => { if (c.trimestreDisponivel) { acc[`T${c.trimestreDisponivel}`] = (acc[`T${c.trimestreDisponivel}`] || 0) + 1; } return acc; }, {}),
            cursosPorNivel: data.reduce((acc, c) => { const n = c.nivel || "N/D"; acc[n] = (acc[n] || 0) + 1; return acc; }, {}),
        };
    }

    const atividadesPorPedagogo = ["outrasAtividades", "outrasFormacoes"].reduce((acc, key) => {
        (dadosBrutos[key] || []).forEach(atv => {
            const responsavel = atv.filename.replace("Checklist de Entregas - ", "").replace(".xlsx", "");
            if (pedagogosPrincipais.includes(responsavel)) {
                if (!acc[responsavel]) acc[responsavel] = {};
                const atividadeNome = atv.Atividade || "Não especificada";
                acc[responsavel][atividadeNome] = (acc[responsavel][atividadeNome] || 0) + 1;
            }
        });
        return acc;
    }, {});
    
    const dashboardData = {
      gerado_em: new Date().toISOString(),
      analises: { Total: gerarAnalise('Total'), 2025: gerarAnalise(2025), 2026: gerarAnalise(2026) },
      eventosCalendario,
      atividadesPorPedagogo,
      listaCompleta: cursosLimpos
    };

    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate'); 
    return response.status(200).json(dashboardData);

  } catch (error) {
    return response.status(500).json({ error: error.message, stack: error.stack });
  }
}
