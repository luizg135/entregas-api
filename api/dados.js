// Arquivo: api/dados.js
// Este é o código COMPLETO da sua API. Ele contém:
// 1. Funções Utilitárias (para datas e nomes)
// 2. Funções de Processamento (para limpar cada tipo de dado do JSON)
// 3. Funções de Análise (para agregar os dados e criar os KPIs)
// 4. O Handler Principal (a função que é executada quando a API é chamada)

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
        .map(curso => {
            const dataCampo = excelDateToJSDate(curso["Disponível a campo"]);
            return {
              nome: curso.Curso, nivel: curso.Nível, tipo: curso.Tipo,
              pedagogo: normalizePedagogueName(curso.Pedagogo), // Nome normalizado aqui
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
        curso: formacao.Curso, nivel: formacao.Nível, tipo: formacao.Tipo,
        pedagogo: normalizePedagogueName(formacao.Pedagogo), // Nome normalizado aqui
        inicio: excelDateToJSDate(formacao["Início (Data)"]),
        fim: excelDateToJSDate(formacao["Final (Data)"]),
        tecnico: getPersonNameFromFile(formacao.filename),
    }));
}

function processarEventos(eventos = []) {
    return eventos.map(evento => ({
        tema: evento.Tema, tipo: evento.Tipo, estilo: evento.Estilo,
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
            tipo: atividade.Tipo, tema: atividade.Tema, inicio,
            fim: excelDateToJSDate(atividade["Final (Data)"]),
            responsavel: pessoa,
            ano: inicio ? inicio.getFullYear() : null
        };
        // Separa as atividades com base na lista de pedagogos que você definiu como principais
        // No handler, estamos usando ["Josimeri Grein", "Leandro Prado", "Enderson Lopes"]
        if (pedagogosPrincipais.includes(pessoa)) {
            atividadesProcessadas.pedagogos.push(itemProcessado);
        } else {
            atividadesProcessadas.tecnicos.push(itemProcessado);
        }
    });
    return atividadesProcessadas;
}

// --- FUNÇÕES DE ANÁLISE E AGREGAÇÃO ---

const gerarAnaliseGeral = (cursosLimpos) => {
    const filterByYear = (data, year) => (year === 'Total') ? data : data.filter(c => c.anoDisponivel === parseInt(year));
    
    const gerarAnaliseParaAno = (year) => {
        const dataFiltrada = filterByYear(cursosLimpos, year);
        const metaEntregas = dataFiltrada.length;
        const novos = dataFiltrada.filter(c => c.tipo === 'Curso novo');
        const atualizacoes = dataFiltrada.filter(c => c.tipo === 'Atualização');
        const novosEntregues = novos.filter(c => c.etapaAtual === 'Entregue').length;
        const atualizacoesEntregues = atualizacoes.filter(c => c.etapaAtual === 'Entregue').length;

        const mapaEtapas = { "Prospecção e Contratação de Especialistas": "Etapa 1", "Edital de Credenciamento": "Etapa 2", "Curso Piloto": "Etapa 3", "Formação de Instrutores": "Etapa 4", "Entrega Técnica": "Etapa 5", "Lançamento a Campo": "Etapa 6", "Entregue": "Entregue" };
        const cursosPorEtapa = dataFiltrada.reduce((acc, c) => { const etapa = mapaEtapas[c.etapaAtual] || "Outra"; acc[etapa] = (acc[etapa] || 0) + 1; return acc; }, {});
        const entregasPorTrimestre = dataFiltrada.reduce((acc, c) => { if (c.trimestreDisponivel) { acc[`T${c.trimestreDisponivel}`] = (acc[`T${c.trimestreDisponivel}`] || 0) + 1; } return acc; }, {});
        const cursosPorNivel = dataFiltrada.reduce((acc, c) => { const nivel = c.nivel || "Não definido"; acc[nivel] = (acc[nivel] || 0) + 1; return acc; }, {});
        
        // **NOVO** Cálculo da média dos indicadores para o velocímetro
        const totalIndicadores = dataFiltrada.reduce((acc, c) => acc + (c.indicadorReal || 0), 0);
        const kpiGeral = dataFiltrada.length > 0 ? Math.round((totalIndicadores / dataFiltrada.length) * 100) : 0;

        return {
            metaEntregas,
            totalEntregas: { totalNovos: novos.length, totalAtualizacoes: atualizacoes.length, novosEntregues, atualizacoesEntregues },
            cursosPorEtapa, planejamentoTrimestral: entregasPorTrimestre, cursosPorNivel, kpiGeral
        };
    }

    const anosDisponiveis = [...new Set(cursosLimpos.map(c => c.anoDisponivel).filter(Boolean))].sort();
    const analises = { Total: gerarAnaliseParaAno('Total') };
    anosDisponiveis.forEach(ano => { analises[ano] = gerarAnaliseParaAno(ano); });
    return analises;
}

function gerarEventosCalendario(cursos, formacoes, eventos) {
    const calendario = [];
    cursos.forEach(c => {
        if (c.pilotoInicio) calendario.push({ title: `Início Piloto: ${c.nome}`, date: c.pilotoInicio.toISOString().split('T')[0], type: 'piloto' });
        if (c.pilotoFim) calendario.push({ title: `Fim Piloto: ${c.nome}`, date: c.pilotoFim.toISOString().split('T')[0], type: 'piloto' });
        if (c.formacaoInicio) calendario.push({ title: `Início Formação: ${c.nome}`, date: c.formacaoInicio.toISOString().split('T')[0], type: 'formacao' });
        if (c.formacaoFim) calendario.push({ title: `Fim Formação: ${c.nome}`, date: c.formacaoFim.toISOString().split('T')[0], type: 'formacao' });
    });
    formacoes.forEach(f => { if (f.inicio) calendario.push({ title: `Formação Adicional: ${f.curso}`, date: f.inicio.toISOString().split('T')[0], type: 'outra_formacao' }); });
    eventos.forEach(e => { if (e.inicio) calendario.push({ title: `${e.tipo}: ${e.tema}`, date: e.inicio.toISOString().split('T')[0], type: 'evento' }); });
    return calendario.sort((a,b) => new Date(a.date) - new Date(b.date));
}

// --- HANDLER PRINCIPAL DA API ---
// Esta é a função que a Vercel executa. Ela junta tudo.

export default async function handler(request, response) {
  const googleDriveUrl = "https://drive.google.com/uc?export=download&id=1p-hxGxOqDmsq-Z583mL57vXZShqdn-3u";
  // Define a lista de pedagogos cujas atividades devem ser tratadas separadamente
  const pedagogosPrincipais = ["Josimeri Grein", "Leandro Prado", "Enderson Lopes"];

  try {
    // 1. Busca e carrega o arquivo JSON
    const fileResponse = await fetch(googleDriveUrl);
    if (!fileResponse.ok) throw new Error(`Erro ao buscar do Google Drive: ${fileResponse.statusText}`);
    const dadosBrutos = await fileResponse.json();

    // 2. Executa todas as funções de processamento para limpar e estruturar os dados
    const cursosLimpos = processarChecklist(dadosBrutos.checklist);
    const formacoesLimpas = processarOutrasFormacoes(dadosBrutos.outrasFormacoes);
    const eventosLimpos = processarEventos(dadosBrutos.eventos);
    const atividadesProcessadas = processarOutrasAtividades(dadosBrutos.outrasAtividades, pedagogosPrincipais);
    
    // 3. Executa as funções de análise para criar os dados agregados para os gráficos e cards
    const analisesGerais = gerarAnaliseGeral(cursosLimpos);
    
    // **CORRIGIDO** Cria a lista de próximos lançamentos, garantindo nome completo do pedagogo
    const proximosLancamentos = cursosLimpos
        .filter(c => c.dataDisponivel && c.dataDisponivel >= new Date())
        .sort((a,b) => a.dataDisponivel - b.dataDisponivel)
        .map(c => ({ 
            ...c, 
            dataLancamento: c.dataDisponivel, 
            percentual: (c.conclusao || 0) * 100 
        }));
        
    const eventosCalendario = gerarEventosCalendario(cursosLimpos, formacoesLimpas, eventosLimpos);

    // 4. Monta o objeto final que será enviado como resposta da API
    const dashboardData = {
      gerado_em: new Date().toISOString(),
      analises: analisesGerais, 
      proximosLancamentos, 
      eventosCalendario,
      dadosProcessados: {
          cursos: cursosLimpos, 
          formacoes: formacoesLimpas, 
          eventos: eventosLimpos,
          outrasAtividades: atividadesProcessadas.pedagogos,
      }
    };

    // 5. Envia a resposta com sucesso
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate'); 
    return response.status(200).json(dashboardData);

  } catch (error) {
    console.error("Erro na API:", error);
    return response.status(500).json({ error: error.message, stack: error.stack });
  }
}
