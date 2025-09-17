// Arquivo: api/dados.js

// --- FUNÇÕES UTILITÁRIAS ---

// Converte a data serial do Excel para um objeto Date do JavaScript
function excelDateToJSDate(excelDate) {
  if (!excelDate || typeof excelDate !== 'number' || excelDate < 1) {
    return null; // Retorna nulo se a data for inválida ou vazia
  }
  const date = new Date((excelDate - 25569) * 86400 * 1000);
  date.setMinutes(date.getMinutes() + date.getTimezoneOffset());
  return date;
}

// Extrai o nome do técnico ou pedagogo do nome do arquivo
function getPersonNameFromFile(filename = "") {
    return filename
        .replace("Checklist de Entregas - ", "")
        .replace("Outras Atividades - ", "")
        .replace(".xlsx", "")
        .trim();
}


// --- FUNÇÕES DE PROCESSAMENTO DE DADOS ---

/**
 * Processa a lista de cursos do checklist.
 * Limpa os dados, calcula indicadores e extrai o nome do técnico.
 */
function processarChecklist(checklist = []) {
    const hoje = new Date();
    return checklist
        .filter(curso => curso.Curso && curso.Curso.trim() !== "")
        .map(curso => {
            const dataCampo = excelDateToJSDate(curso["Disponível a campo"]);
            const diffMeses = dataCampo ? (dataCampo.getFullYear() - hoje.getFullYear()) * 12 + (dataCampo.getMonth() - hoje.getMonth()) : Infinity;

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
              tecnico: getPersonNameFromFile(curso.filename),
              pilotoInicio: excelDateToJSDate(curso["Curso Piloto (Início)"]),
              pilotoFim: excelDateToJSDate(curso["Curso Piloto (Final)"]),
              formacaoInicio: excelDateToJSDate(curso["Formação (Início)"]),
              formacaoFim: excelDateToJSDate(curso["Formação (Final)"]),
            };
        });
}

/**
 * Processa a lista de outras formações, convertendo datas.
 */
function processarOutrasFormacoes(outrasFormacoes = []) {
    return outrasFormacoes.map(formacao => ({
        curso: formacao.Curso,
        nivel: formacao.Nível,
        tipo: formacao.Tipo,
        pedagogo: formacao.Pedagogo,
        inicio: excelDateToJSDate(formacao["Início (Data)"]),
        fim: excelDateToJSDate(formacao["Final (Data)"]),
        tecnico: getPersonNameFromFile(formacao.filename),
    }));
}

/**
 * Processa a lista de eventos, convertendo datas.
 */
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

/**
 * Processa a lista de outras atividades, identificando se são de pedagogos ou técnicos.
 */
function processarOutrasAtividades(outrasAtividades = [], pedagogosPrincipais = []) {
    const atividadesProcessadas = {
        pedagogos: [],
        tecnicos: [] // Reserva para futuras implementações, se necessário
    };

    outrasAtividades.forEach(atividade => {
        const pessoa = getPersonNameFromFile(atividade.filename);
        const itemProcessado = {
            tipo: atividade.Tipo,
            tema: atividade.Tema,
            inicio: excelDateToJSDate(atividade["Início (Data)"]),
            fim: excelDateToJSDate(atividade["Final (Data)"]),
            responsavel: pessoa,
            ano: excelDateToJSDate(atividade["Início (Data)"]) ? excelDateToJSDate(atividade["Início (Data)"]).getFullYear() : null
        };

        // Separa as atividades com base na lista de pedagogos
        if (pedagogosPrincipais.includes(pessoa)) {
            atividadesProcessadas.pedagogos.push(itemProcessado);
        } else {
            atividadesProcessadas.tecnicos.push(itemProcessado);
        }
    });

    return atividadesProcessadas;
}


// --- FUNÇÕES DE ANÁLISE E AGREGAÇÃO ---

/**
 * Gera as principais análises de KPI para o dashboard a partir dos cursos processados.
 */
const gerarAnaliseGeral = (cursosLimpos) => {
    const filterByYear = (data, year) => {
        if (year === 'Total') return data;
        return data.filter(c => c.anoDisponivel === parseInt(year));
    }
    
    const gerarAnaliseParaAno = (year) => {
        const dataFiltrada = filterByYear(cursosLimpos, year);
        const metaEntregas = dataFiltrada.length;

        const novos = dataFiltrada.filter(c => c.tipo === 'Curso novo');
        const atualizacoes = dataFiltrada.filter(c => c.tipo === 'Atualização');
        const novosEntregues = novos.filter(c => c.etapaAtual === 'Entregue').length;
        const atualizacoesEntregues = atualizacoes.filter(c => c.etapaAtual === 'Entregue').length;

        const mapaEtapas = {
            "Prospecção e Contratação de Especialistas": "Etapa 1", "Edital de Credenciamento": "Etapa 2",
            "Curso Piloto": "Etapa 3", "Formação de Instrutores": "Etapa 4", "Entrega Técnica": "Etapa 5",
            "Lançamento a Campo": "Etapa 6", "Entregue": "Entregue",
        };
        const cursosPorEtapa = dataFiltrada.reduce((acc, c) => {
            const etapaMapeada = mapaEtapas[c.etapaAtual] || "Outra";
            acc[etapaMapeada] = (acc[etapaMapeada] || 0) + 1;
            return acc;
        }, {});

        const entregasPorTrimestre = dataFiltrada.reduce((acc, c) => {
            if (c.trimestreDisponivel) {
                const key = `T${c.trimestreDisponivel}`;
                acc[key] = (acc[key] || 0) + 1;
            }
            return acc;
        }, {});
        
        const cursosPorNivel = dataFiltrada.reduce((acc, c) => {
            const nivel = c.nivel || "Não definido";
            acc[nivel] = (acc[nivel] || 0) + 1;
            return acc;
        }, {});

        return {
            metaEntregas,
            totalEntregas: { totalNovos: novos.length, totalAtualizacoes: atualizacoes.length, novosEntregues, atualizacoesEntregues },
            cursosPorEtapa,
            planejamentoTrimestral: entregasPorTrimestre,
            cursosPorNivel
        };
    }

    const anosDisponiveis = [...new Set(cursosLimpos.map(c => c.anoDisponivel).filter(Boolean))].sort();
    const analises = { Total: gerarAnaliseParaAno('Total') };
    anosDisponiveis.forEach(ano => {
        analises[ano] = gerarAnaliseParaAno(ano);
    });
    
    return analises;
}

/**
 * Gera a lista de eventos para o calendário unificado.
 * Agora inclui as "outras formações" associadas ao curso principal.
 */
function gerarEventosCalendario(cursos, formacoes, eventos) {
    const calendario = [];

    // Adiciona eventos do checklist (pilotos e formações principais)
    cursos.forEach(c => {
        if (c.pilotoInicio) calendario.push({ title: `Início Piloto: ${c.nome}`, date: c.pilotoInicio.toISOString().split('T')[0], type: 'piloto' });
        if (c.pilotoFim) calendario.push({ title: `Fim Piloto: ${c.nome}`, date: c.pilotoFim.toISOString().split('T')[0], type: 'piloto' });
        if (c.formacaoInicio) calendario.push({ title: `Início Formação: ${c.nome}`, date: c.formacaoInicio.toISOString().split('T')[0], type: 'formacao' });
        if (c.formacaoFim) calendario.push({ title: `Fim Formação: ${c.nome}`, date: c.formacaoFim.toISOString().split('T')[0], type: 'formacao' });
    });

    // Adiciona eventos de "Outras Formações"
    formacoes.forEach(f => {
        if (f.inicio) calendario.push({ title: `Formação Adicional: ${f.curso}`, date: f.inicio.toISOString().split('T')[0], type: 'outra_formacao' });
    });

    // Adiciona "Eventos"
    eventos.forEach(e => {
        if (e.inicio) calendario.push({ title: `${e.tipo}: ${e.tema}`, date: e.inicio.toISOString().split('T')[0], type: 'evento' });
    });

    return calendario.sort((a,b) => new Date(a.date) - new Date(b.date));
}

// --- HANDLER PRINCIPAL DA API ---

export default async function handler(request, response) {
  const googleDriveUrl = "https://drive.google.com/uc?export=download&id=1p-hxGxOqDmsq-Z583mL57vXZShqdn-3u";
  const pedagogosPrincipais = ["Josimeri Grein", "Leandro Prado", "Enderson Lopes"];

  try {
    // 1. BUSCAR OS DADOS BRUTOS
    const fileResponse = await fetch(googleDriveUrl);
    if (!fileResponse.ok) {
      throw new Error(`Erro ao buscar do Google Drive: ${fileResponse.statusText}`);
    }
    const dadosBrutos = await fileResponse.json();

    // =================================================================
    // 2. PROCESSAMENTO E LIMPEZA DOS DADOS
    // =================================================================
    const cursosLimpos = processarChecklist(dadosBrutos.checklist);
    const formacoesLimpas = processarOutrasFormacoes(dadosBrutos.outrasFormacoes);
    const eventosLimpos = processarEventos(dadosBrutos.eventos);
    // TRATAMENTO ESPECIAL AQUI:
    const atividadesProcessadas = processarOutrasAtividades(dadosBrutos.outrasAtividades, pedagogosPrincipais);

    // =================================================================
    // 3. ESTRUTURAÇÃO DAS ANÁLISES PARA O DASHBOARD
    // =================================================================
    
    // Análise principal de KPIs
    const analisesGerais = gerarAnaliseGeral(cursosLimpos);

    // Lista de Próximos Lançamentos
    const proximosLancamentos = cursosLimpos
        .filter(c => c.dataDisponivel && c.dataDisponivel >= new Date())
        .sort((a,b) => a.dataDisponivel - b.dataDisponivel)
        .map(c => ({
            ...c, // Passa o objeto do curso completo para o modal
            dataLancamento: c.dataDisponivel,
            percentual: (c.conclusao || 0) * 100 
        }));
        
    // Calendário de eventos unificado
    const eventosCalendario = gerarEventosCalendario(cursosLimpos, formacoesLimpas, eventosLimpos);

    // =================================================================
    // 4. MONTAR O OBJETO DE RESPOSTA FINAL
    // =================================================================
    const dashboardData = {
      gerado_em: new Date().toISOString(),
      analises: analisesGerais,
      proximosLancamentos,
      eventosCalendario,
      // DADOS PROCESSADOS PARA O FRONTEND CONSUMIR DIRETAMENTE
      dadosProcessados: {
          cursos: cursosLimpos,
          formacoes: formacoesLimpas,
          eventos: eventosLimpos,
          outrasAtividades: atividadesProcessadas.pedagogos, // Envia APENAS as atividades dos pedagogos
      }
    };

    // 5. ENVIAR A RESPOSTA
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate'); 
    return response.status(200).json(dashboardData);

  } catch (error) {
    console.error("Erro na API:", error); // Adiciona um log do erro no servidor
    return response.status(500).json({ error: error.message, stack: error.stack });
  }
}
