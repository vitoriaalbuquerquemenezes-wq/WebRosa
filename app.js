// Cores: uma por diagnóstico, as mesmas em todos os gráficos
// Verde = benigno, vermelho = maligno, amarelo = atenção, azul = informação
const COR_BENIGNO = "#2e8b57";
const COR_MALIGNO = "#c0392b";
const COR_ATENCAO = "#d99a00";
const COR_INFO = "#1f5fa6";

// Faixas de risco (em %): abaixo de 30 verde, de 30 a 70 amarelo, acima de 70 vermelho
const LIMITE_MEDIO = 30;
const LIMITE_ALTO = 70;

function corRisco(percentual) {
  if (percentual > LIMITE_ALTO) return COR_MALIGNO;
  if (percentual >= LIMITE_MEDIO) return COR_ATENCAO;
  return COR_BENIGNO;
}

// Aparência padrão dos gráficos: sóbria, sem arredondamentos
Chart.defaults.font.family = '"Public Sans", system-ui, sans-serif';
Chart.defaults.font.size = 13;
Chart.defaults.color = "#4b5563";
Chart.defaults.borderColor = "#e5e7eb";
Chart.defaults.plugins.title.font = { size: 15, weight: "700" };
Chart.defaults.plugins.title.color = "#1f2a37";
Chart.defaults.plugins.title.align = "start";
Chart.defaults.plugins.title.padding = { bottom: 14 };
Chart.defaults.plugins.legend.labels.boxWidth = 12;
Chart.defaults.plugins.legend.labels.boxHeight = 12;
Chart.defaults.plugins.tooltip.cornerRadius = 2;
Chart.defaults.plugins.tooltip.backgroundColor = "#1f2a37";

let dados = null;
let graficoLinha = null;

async function iniciar() {
  if (window.DADOS) {
    // dados.js carregado pelo index.html: funciona até com duplo clique no arquivo
    dados = window.DADOS;
  } else {
    try {
      const resposta = await fetch("dados.json");
      if (!resposta.ok) throw new Error("HTTP " + resposta.status);
      dados = await resposta.json();
    } catch (erro) {
      console.error("Falha ao carregar os dados:", erro);
      document.getElementById("erro").hidden = false;
      return;
    }
  }

  preencherIndicadores();
  desenharPizza();
  desenharBarras();
  montarFiltros();
  desenharLinha();
}

function preencherIndicadores() {
  // Seção "Sobre a base de dados", no fim da página
  const acerto = dados.modelo.acuracia_teste.toString().replace(".", ",") + "%";
  document.getElementById("base-fonte").textContent = dados.fonte;
  document.getElementById("base-total").textContent = dados.total_casos;
  document.getElementById("base-acerto").textContent = acerto;
  document.getElementById("base-diag").textContent = dados.pizza.rotulos
    .map((rotulo, i) => `${dados.pizza.valores[i]} ${rotulo.toLowerCase()}s`)
    .join(" e ");
}

// Gráfico 1: pizza (benignos x malignos)
function desenharPizza() {
  new Chart(document.getElementById("g-pizza"), {
    type: "pie",
    data: {
      labels: dados.pizza.rotulos,
      datasets: [{
        data: dados.pizza.valores,
        backgroundColor: [COR_BENIGNO, COR_MALIGNO],
        borderColor: "#ffffff",
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: "Número de casos por diagnóstico (unidade: casos)" },
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: (item) => {
              const total = dados.pizza.valores.reduce((a, b) => a + b, 0);
              const pct = ((item.parsed / total) * 100).toFixed(1).replace(".", ",");
              return `${item.label}: ${item.parsed} casos (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

// Gráfico 2: barras (raio médio por diagnóstico)
function desenharBarras() {
  new Chart(document.getElementById("g-barras"), {
    type: "bar",
    data: {
      labels: dados.barras.rotulos,
      datasets: [{
        label: "Raio médio",
        data: dados.barras.valores,
        backgroundColor: [COR_BENIGNO, COR_MALIGNO],
        barPercentage: 0.55,
        categoryPercentage: 0.8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: "Raio médio das células por diagnóstico" },
        legend: { display: false }
      },
      scales: {
        x: { grid: { display: false }, title: { display: true, text: "Diagnóstico confirmado" } },
        y: {
          beginAtZero: true,
          title: { display: true, text: "Raio médio (unidades do dataset)" }
        }
      }
    }
  });
}

// Filtros do gráfico de linha (interatividade)
function montarFiltros() {
  const selectFaixa = document.getElementById("f-faixa");
  dados.linha.rotulos.forEach((rotulo, i) => {
    const opcao = document.createElement("option");
    opcao.value = i;
    opcao.textContent = i === 0 ? "Todas as faixas" : rotulo;
    selectFaixa.appendChild(opcao);
  });

  selectFaixa.addEventListener("change", desenharLinha);
  document.getElementById("f-metrica").addEventListener("change", desenharLinha);
}

// Gráfico 3: linha (malignidade por faixa de raio), reage aos dois filtros
function desenharLinha() {
  const inicio = Number(document.getElementById("f-faixa").value) || 0;
  const metrica = document.getElementById("f-metrica").value;

  const rotulos = dados.linha.rotulos.slice(inicio);
  const valores = (metrica === "pct" ? dados.linha.valores : dados.linha.contagem).slice(inicio);
  const textoY = metrica === "pct" ? "Casos malignos (%)" : "Número de casos";
  const textoTitulo = metrica === "pct"
    ? "Percentual de casos malignos por faixa de raio médio"
    : "Número de casos por faixa de raio médio";

  if (graficoLinha) graficoLinha.destroy();

  graficoLinha = new Chart(document.getElementById("g-linha"), {
    type: "line",
    data: {
      labels: rotulos,
      datasets: [{
        label: textoY,
        data: valores,
        // linha neutra; cada ponto leva a cor da faixa de risco (só no modo %)
        borderColor: metrica === "pct" ? "#9ca3af" : COR_INFO,
        backgroundColor: metrica === "pct" ? valores.map(corRisco) : COR_INFO,
        pointBackgroundColor: metrica === "pct" ? valores.map(corRisco) : COR_INFO,
        pointBorderColor: "#ffffff",
        pointBorderWidth: 1.5,
        borderWidth: 2,
        tension: 0,
        pointRadius: 6,
        pointHoverRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: textoTitulo },
        legend: { display: false }
      },
      scales: {
        x: {
          grid: { display: false },
          title: { display: true, text: "Faixa de raio médio das células (unidades do dataset)" }
        },
        y: {
          beginAtZero: true,
          max: metrica === "pct" ? 100 : undefined,
          title: { display: true, text: textoY }
        }
      }
    }
  });
}

// Colore a tabela da fila (gerada pelo crud.js) sem depender dele:
// probabilidade da IA por faixa de risco e resultado à paciente por significado
function colorirTabela() {
  document.querySelectorAll("#corpo-fila tr").forEach((tr) => {
    const c = tr.cells;
    if (c.length < 6) return;

    let prob = parseFloat(c[1].textContent.replace("%", "").replace(",", "."));
    if (!isNaN(prob)) {
      if (!c[1].textContent.includes("%") && prob <= 1) prob *= 100;
      c[1].classList.toggle("risco-baixo", prob < LIMITE_MEDIO);
      c[1].classList.toggle("risco-medio", prob >= LIMITE_MEDIO && prob <= LIMITE_ALTO);
      c[1].classList.toggle("risco-alto", prob > LIMITE_ALTO);
    }

    const resultado = c[5].textContent.toLowerCase();
    c[5].classList.toggle("res-liberado", resultado.includes("liberado"));
    c[5].classList.toggle("res-retido", resultado.includes("retido"));
  });
}

// Menu do topo: destaca a seção que está na tela (a página é uma só, com rolagem)
function destacarSecaoAtual() {
  const links = Array.from(document.querySelectorAll(".menu a"));
  if (!links.length || !("IntersectionObserver" in window)) return;

  const marcar = (id) => links.forEach((a) => {
    const atual = a.getAttribute("href") === "#" + id;
    a.classList.toggle("atual", atual);
    if (atual) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
  });

  const observador = new IntersectionObserver((entradas) => {
    entradas.forEach((e) => { if (e.isIntersecting) marcar(e.target.id); });
  }, { rootMargin: "-35% 0px -55% 0px" });

  links.forEach((a) => {
    const secao = document.querySelector(a.getAttribute("href"));
    if (secao) observador.observe(secao);
  });
}

destacarSecaoAtual();

// "Sobre a base de dados" fica escondida até a pessoa pedir
const btnBase = document.getElementById("btn-base");
const secaoBase = document.getElementById("fonte-dados");
function mostrarBase(abrir) {
  secaoBase.hidden = !abrir;
  btnBase.setAttribute("aria-expanded", String(abrir));
  btnBase.textContent = abrir ? "Ocultar dados da base" : "Sobre a base de dados";
  if (abrir) secaoBase.scrollIntoView({ behavior: "smooth", block: "start" });
}
btnBase.addEventListener("click", () => mostrarBase(secaoBase.hidden));
document.getElementById("btn-ocultar-base").addEventListener("click", () => {
  mostrarBase(false);
  btnBase.focus();
});

const corpoFila = document.getElementById("corpo-fila");
if (corpoFila) {
  new MutationObserver(colorirTabela).observe(corpoFila, { childList: true });
  colorirTabela();
}

iniciar();