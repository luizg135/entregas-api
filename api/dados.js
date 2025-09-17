// Arquivo: api/dados.js
// VERSÃO FINAL - Com filtro de pedagogos na fonte de dados

// --- FUNÇÕES UTILITÁRIAS ---

function excelDateToJSDate(excelDate) {
  if (!excelDate || typeof excelDate !== 'number' || excelDate < 1) return null;
  const date = new Date((excelDate - 25569) * 86400 * 1000);
  date.setMinutes(date.getMinutes() + date.getTimezoneOffset());
  return date;
}

function getPersonNameFromFile(filename = "") {
    return filename.replace(/Checklist de Entregas - |Outras Atividades - |\.(xlsx|xls)/g, "").trim();
}

const pedagogueNameMap = { 
    "Josimeri": "Josimeri Grein", "Leandro": "Leandro Prado", "Enderson": "Enderson Lopes",
    "Regiane": "Regiane Hornung", "Marcia": "Marcia Salles"
};
const normalizePedagogueName = (name) => pedagogueNameMap[name] || name;

// --- FUNÇÕES DE PROCESSAMENTO ---

function processarDados(dadosBrutos, pedagogosPrincipais) {
    const todosCursos = dadosBrutos.checklist
        .filter(c => c.Curso && c.Curso.trim() !== "")
        .map(c => ({
            nome: c.Curso, nivel: c.Nível, tipo: c.Tipo,
            pedagogo: normalizePedagogueName(c.Pedagogo),
            dataDisponivel: excelDateToJSDate(c["Disponível a campo"]),
            anoDisponivel: excelDateToJSDate(c["Disponível a campo"])?.getFullYear() || null,
            trimestreDisponivel: Math.ceil((excelDateToJSDate(c["Disponível a campo"])?.getMonth() + 1) / 3) || null,
            indicadorReal: parseFloat(c.Indicador || 0),
            etapaAtual: c["Etapa Atual"],
            tecnico: getPersonNameFromFile(c.filename),
            pilotoInicio: excelDateToJSDate(c["Curso Piloto (Início)"]),
            pilotoFim: excelDateToJSDate(c["Curso Piloto (Final)"]),
            formacaoInicio: excelDateToJSDate(c["Formação (Início)"]),
            formacaoFim: excelDateToJSDate(c["Formação (Final)"]),
        }));

    // Filtra os cursos para manter apenas os que são dos pedagogos principais
    const cursosLimpos = todosCursos.filter(c => pedagogosPrincipais.includes(c.pedagogo));
    const nomesCursosDosPedagogos = new Set(cursosLimpos.map(c => c.nome));

    const formacoesLimpas = dadosBrutos.outrasFormacoes
        .filter(f => nomesCursosDosPedagogos.has(f.Curso)) // Mantém apenas formações de cursos dos pedagogos
        .map(f => ({
            curso: f.Curso,
            pedagogo: normalizePedagogueName(f.Pedagogo),
            inicio: excelDateToJSDate(f["Início (Data)"]),
            fim: excelDateToJSDate(f["Final (Data)"]),
        }));

    const atividadesProcessadas = dadosBrutos.outrasAtividades
        .map(a => {
            const inicio = excelDateToJSDate(a["Início (Data)"]);
            return {
                tipo: a.Tipo, tema: a.Tema, inicio,
                responsavel: getPersonNameFromFile(a.filename),
                ano: inicio?.getFullYear() || null
            };
        })
        .filter(a => pedagogosPrincipais.includes(a.responsavel)); // Mantém apenas atividades dos pedagogos
    
    // Mantemos todos os eventos e a lista completa de cursos para as outras abas
    const eventosLimpos = dadosBrutos.eventos.map(e => ({
        tema: e.Tema, tipo: e.Tipo,
        inicio: excelDateToJSDate(e["Início (Data)"]),
    }));

    return { todosCursos, cursosLimpos, formacoesLimpas, atividadesProcessadas, eventosLimpos };
}

// --- FUNÇÕES DE ANÁLISE ---

const gerarAnaliseGeral = (cursos) => {
    const gerarAnaliseParaAno = (year) => {
        const dataFiltrada = (year === 'Total') ? cursos : cursos.filter(c => c.anoDisponivel === parseInt(year));
        const totalIndicadores = dataFiltrada.reduce((acc, c) => acc + (c.indicadorReal || 0), 0);
        return {
            metaEntregas: dataFiltrada.length,
            totalEntregas: {
                totalNovos: dataFiltrada.filter(c => c.tipo === 'Curso novo').length,
                novosEntregues: dataFiltrada.filter(c => c.tipo === 'Curso novo' && c.etapaAtual === 'Entregue').length,
                totalAtualizacoes: dataFiltrada.filter(c => c.tipo === 'Atualização').length,
                atualizacoesEntregues: dataFiltrada.filter(c => c.tipo === 'Atualização' && c.etapaAtual === 'Entregue').length,
            },
            kpiGeral: dataFiltrada.length > 0 ? Math.round((totalIndicadores / dataFiltrada.length) * 100) : 0,
        };
    }
    const anosDisponiveis = [...new Set(cursos.map(c => c.anoDisponivel).filter(Boolean))].sort();
    const analises = { Total: gerarAnaliseParaAno('Total') };
    anosDisponiveis.forEach(ano => { analises[ano] = gerarAnaliseParaAno(ano); });
    return analises;
}

// --- HANDLER PRINCIPAL ---

export default async function handler(request, response) {
  const googleDriveUrl = "https://drive.google.com/uc?export=download&id=1p-hxGxOqDmsq-Z583mL57vXZShqdn-3u";
  const pedagogosPrincipais = ["Josimeri Grein", "Leandro Prado", "Enderson Lopes"];

  try {
    const fileResponse = await fetch(googleDriveUrl);
    if (!fileResponse.ok) throw new Error(`Erro ao buscar do Google Drive: ${fileResponse.statusText}`);
    const dadosBrutos = await fileResponse.json();

    const { todosCursos, cursosLimpos, formacoesLimpas, atividadesProcessadas, eventosLimpos } = processarDados(dadosBrutos, pedagogosPrincipais);
    
    // As análises gerais usam TODOS os cursos, não apenas os dos pedagogos
    const analisesGerais = gerarAnaliseGeral(todosCursos);
    
    const proximosLancamentos = todosCursos
        .filter(c => c.dataDisponivel && c.dataDisponivel >= new Date())
        .sort((a,b) => a.dataDisponivel - b.dataDisponivel);

    const dashboardData = {
      gerado_em: new Date().toISOString(),
      analises: analisesGerais, proximosLancamentos,
      // dadosProcessados contém os dados já filtrados para a aba de pedagogos
      dadosProcessados: {
          cursos: cursosLimpos,
          formacoes: formacoesLimpas,
          outrasAtividades: atividadesProcessadas,
          // Enviamos a lista completa de cursos e eventos para as abas 1 e 2
          _fullData: {
            cursos: todosCursos,
            eventos: eventosLimpos
          }
      }
    };

    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate'); 
    return response.status(200).json(dashboardData);

  } catch (error) {
    console.error("Erro na API:", error);
    return response.status(500).json({ error: error.message, stack: error.stack });
  }
}
