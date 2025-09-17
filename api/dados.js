// Arquivo: api/dados.js

// --- FUNÇÃO UTILITÁRIA ---
// Converte a data serial do Excel para um objeto Date do JavaScript
function excelDateToJSDate(excelDate) {
  if (!excelDate || typeof excelDate !== 'number' || excelDate < 1) {
    return null; // Retorna nulo se a data for inválida ou vazia
  }
  // O número 25569 é a diferença de dias entre a data base do Excel (01/01/1900) e do JS (01/01/1970)
  const date = new Date((excelDate - 25569) * 86400 * 1000);
  // Ajusta o fuso horário para evitar problemas de um dia a menos
  date.setMinutes(date.getMinutes() + date.getTimezoneOffset());
  return date;
}

export default async function handler(request, response) {
  const googleDriveUrl = "https://drive.google.com/uc?export=download&id=1p-hxGxOqDmsq-Z583mL57vXZShqdn-3u";

  try {
    // 1. BUSCAR OS DADOS BRUTOS
    const fileResponse = await fetch(googleDriveUrl);
    if (!fileResponse.ok) {
      throw new Error(`Erro ao buscar do Google Drive: ${fileResponse.statusText}`);
    }
    const dadosBrutos = await fileResponse.json();

    // =================================================================
    // 2. LIMPEZA E PREPARAÇÃO DOS DADOS
    // =================================================================
    const cursosLimpos = dadosBrutos.checklist
      .filter(curso => curso.Curso && curso.Curso.trim() !== "") // Remove linhas vazias
      .map(curso => {
        const dataCampo = excelDateToJSDate(curso["Disponível a campo"]);
        const hoje = new Date();
        const diffMeses = dataCampo ? (dataCampo.getFullYear() - hoje.getFullYear()) * 12 + (dataCampo.getMonth() - hoje.getMonth()) : Infinity;

        // 8. CÁLCULO DO INDICADOR CONDICIONAL
        let indicadorCalculado = parseFloat(curso.Indicador || 0);
        if (dataCampo) {
            if (diffMeses >= 6) indicadorCalculado = 0.8;
            else if (diffMeses >= 4) indicadorCalculado = 0.4;
        }

        return {
          nome: curso.Curso,
          nivel: curso.Nível,
          tipo: curso.Tipo,
          pedagogo: curso.Pedagogo,
          dataDisponivel: dataCampo,
          anoDisponivel: dataCampo ? dataCampo.getFullYear() : null,
          trimestreDisponivel: dataCampo ? Math.ceil((dataCampo.getMonth() + 1) / 3) : null,
          valor: parseFloat(curso.Valor || 0),
          peso: parseInt(curso.Peso || 0),
          conclusao: parseFloat(curso.Conclusão || 0),
          indicadorReal: parseFloat(curso.Indicador || 0),
          indicadorCalculado: indicadorCalculado,
          etapaAtual: curso["Etapa Atual"],
          tecnico: curso.filename.replace("Checklist de Entregas - ", "").replace(".xlsx", ""),
          pilotoInicio: excelDateToJSDate(curso["Curso Piloto (Início)"]),
          pilotoFim: excelDateToJSDate(curso["Curso Piloto (Final)"]),
          formacaoInicio: excelDateToJSDate(curso["Formação (Início)"]),
          formacaoFim: excelDateToJSDate(curso["Formação (Final)"]),
        };
      });

    // =================================================================
    // 3. ESTRUTURAÇÃO DAS ANÁLISES
    // =================================================================
    
    // Função auxiliar para aplicar filtros de ano
    const filterByYear = (data, year) => {
        if (year === 'Total') return data;
        return data.filter(c => c.anoDisponivel === year);
    }
    
    // Função principal que gera todas as análises para um determinado ano (ou 'Total')
    const gerarAnalise = (year) => {
        const dataFiltrada = filterByYear(cursosLimpos, year);

        // 1. Meta de Entregas
        const metaEntregas = dataFiltrada.length;

        // 2. Total de Entregas
        const novos = dataFiltrada.filter(c => c.tipo === 'Curso novo');
        const atualizacoes = dataFiltrada.filter(c => c.tipo === 'Atualização');
        const novosEntregues = novos.filter(c => c.etapaAtual === 'Entregue').length;
        const atualizacoesEntregues = atualizacoes.filter(c => c.etapaAtual === 'Entregue').length;

        // 3. Etapa Atual do Curso (com mapeamento)
        const mapaEtapas = {
            "Prospecção e Contratação de Especialistas": "Etapa 1",
            "Edital de Credenciamento": "Etapa 2",
            "Curso Piloto": "Etapa 3",
            "Formação de Instrutores": "Etapa 4",
            "Entrega Técnica": "Etapa 5",
            "Lançamento a Campo": "Etapa 6",
            "Entregue": "Entregue", // Etapa final
        };
        const cursosPorEtapa = dataFiltrada.reduce((acc, c) => {
            const etapaMapeada = mapaEtapas[c.etapaAtual] || "Outra";
            acc[etapaMapeada] = (acc[etapaMapeada] || 0) + 1;
            return acc;
        }, {});

        // 4. Planejamento de Entregas
        const entregasPorTrimestre = dataFiltrada.reduce((acc, c) => {
            if (c.trimestreDisponivel) {
                const key = `T${c.trimestreDisponivel}`;
                acc[key] = (acc[key] || 0) + 1;
            }
            return acc;
        }, {});
        
        // 5. Nível dos Cursos
        const cursosPorNivel = dataFiltrada.reduce((acc, c) => {
            const nivel = c.nivel || "Não definido";
            acc[nivel] = (acc[nivel] || 0) + 1;
            return acc;
        }, {});

        return {
            metaEntregas,
            totalEntregas: {
                totalNovos: novos.length,
                totalAtualizacoes: atualizacoes.length,
                novosEntregues,
                atualizacoesEntregues
            },
            cursosPorEtapa,
            planejamentoTrimestral: entregasPorTrimestre,
            cursosPorNivel
        };
    }

    // Gerar análises para cada escopo necessário
    const analiseTotal = gerarAnalise('Total');
    const analise2025 = gerarAnalise(2025);
    const analise2026 = gerarAnalise(2026);

    // 6. Próximos Lançamentos (lista de cursos)
    const proximosLancamentos = cursosLimpos
        .filter(c => c.dataDisponivel && c.dataDisponivel >= new Date())
        .sort((a,b) => a.dataDisponivel - b.dataDisponivel)
        .map(c => ({
            nome: c.nome,
            nivel: c.nivel,
            dataLancamento: c.dataDisponivel.toLocaleDateString('pt-BR'),
            tecnico: c.tecnico,
            pedagogo: c.pedagogo,
            etapaAtual: c.etapaAtual,
            percentual: c.conclusao * 100 
        }));
        
    // 7. Calendário (eventos)
    const eventosCalendario = cursosLimpos
        .flatMap(c => ([
            c.pilotoInicio ? { title: `Início Piloto: ${c.nome}`, date: c.pilotoInicio.toISOString().split('T')[0], type: 'piloto' } : null,
            c.pilotoFim ? { title: `Fim Piloto: ${c.nome}`, date: c.pilotoFim.toISOString().split('T')[0], type: 'piloto' } : null,
            c.formacaoInicio ? { title: `Início Formação: ${c.nome}`, date: c.formacaoInicio.toISOString().split('T')[0], type: 'formacao' } : null,
            c.formacaoFim ? { title: `Fim Formação: ${c.nome}`, date: c.formacaoFim.toISOString().split('T')[0], type: 'formacao' } : null,
        ]))
        .filter(Boolean); // Remove nulos

    // 9. Outras Atividades (assumindo que viria de dadosBrutos.outrasAtividades)
    const atividadesPorPedagogo = (dadosBrutos.outrasAtividades || []).reduce((acc, atv) => {
      // Usando 'filename' como você sugeriu
      const pedagogo = atv.filename.replace("Checklist de Entregas - ", "").replace(".xlsx", "");
      acc[pedagogo] = (acc[pedagogo] || 0) + 1;
      return acc;
    }, {});


    // =================================================================
    // 4. MONTAR O OBJETO DE RESPOSTA FINAL PARA O DASHBOARD
    // =================================================================
    const dashboardData = {
      gerado_em: new Date().toISOString(),
      analises: {
          Total: analiseTotal,
          2025: analise2025,
          2026: analise2026,
      },
      proximosLancamentos,
      eventosCalendario,
      atividadesPorPedagogo,
      listaCompleta: cursosLimpos
    };

    // 5. ENVIAR A RESPOSTA
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate'); 

    return response.status(200).json(dashboardData);

  } catch (error) {
    return response.status(500).json({ error: error.message, stack: error.stack });
  }
}
