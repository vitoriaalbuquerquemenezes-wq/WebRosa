// ---------- Configuração ----------
const API = "https://parseapi.back4app.com/classes/Caso";
const IBGE = "https://servicodados.ibge.gov.br/api/v1/localidades/estados";
const COR_STATUS = { aguardando: "#b7791f", confirmado: "#0f6b6e", descartado: "#7a8a8f" };

const CABECALHOS = {
  "X-Parse-Application-Id": CONFIG.APP_ID,
  "X-Parse-REST-API-Key": CONFIG.REST_KEY,
  "Content-Type": "application/json"
};

const POR_PAGINA = 12; // quantos casos aparecem por vez
let visiveis = POR_PAGINA;
let totalFiltrado = 0;
let casos = [];
let editandoId = null;
let graficoStatus = null;
const $ = (id) => document.getElementById(id);

// ---------- Chamadas à API REST (as 4 operações do CRUD) ----------
async function chamar(url, opcoes = {}) {
  const r = await fetch(url, { headers: CABECALHOS, ...opcoes });
  if (!r.ok) {
    const corpo = await r.json().catch(() => ({}));
    throw new Error(corpo.error || "Erro " + r.status);
  }
  return r.json();
}

const listar = async () => (await chamar(API + "?limit=1000")).results; // READ
const criar = (c) => chamar(API, { method: "POST", body: JSON.stringify(c) }); // CREATE
const editar = (id, c) => chamar(`${API}/${id}`, { method: "PUT", body: JSON.stringify(c) }); // UPDATE
const excluir = (id) => chamar(`${API}/${id}`, { method: "DELETE" }); // DELETE

// ---------- Mensagens ----------
function mensagem(texto, erro = false) {
  const el = $("msg");
  el.textContent = texto;
  el.className = erro ? "msg msg-erro" : "msg";
  el.hidden = !texto;
}

// ---------- API pública: IBGE (estados e municípios) ----------
async function carregarEstados() {
  const sel = $("c-uf");
  try {
    const resp = await fetch(IBGE + "?orderBy=nome");
    if (!resp.ok) throw new Error();
    const estados = await resp.json();
    sel.innerHTML = '<option value="">Selecione</option>';
    estados.forEach((e) => sel.add(new Option(e.nome, e.sigla)));
  } catch {
    sel.innerHTML = '<option value="">IBGE indisponível</option>';
  }
}

async function carregarMunicipios(uf, selecionado = "") {
  const sel = $("c-municipio");
  sel.innerHTML = '<option value="">Selecione</option>';
  sel.disabled = !uf;
  if (!uf) return;
  try {
    const resp = await fetch(`${IBGE}/${uf}/municipios?orderBy=nome`);
    const lista = await resp.json();
    lista.forEach((m) => sel.add(new Option(m.nome, m.nome)));
    sel.value = selecionado;
  } catch {
    mensagem("Não foi possível carregar os municípios do IBGE.", true);
  }
}

// ---------- Tabela da fila ----------
function celula(texto) {
  const td = document.createElement("td");
  td.textContent = texto;
  return td;
}

function botao(texto, classe, aoClicar) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = texto;
  b.className = "btn btn-pequeno " + classe;
  b.addEventListener("click", aoClicar);
  return b;
}

function linha(c) {
  const tr = document.createElement("tr");
  tr.appendChild(celula(c.codigo));
  tr.appendChild(celula(Math.round(c.probabilidadeIA * 100) + "%"));
  tr.appendChild(celula(c.raioMedio));
  tr.appendChild(celula(c.uf ? `${c.municipio || "–"} / ${c.uf}` : "–"));

  const tdStatus = document.createElement("td");
  const selo = document.createElement("span");
  selo.className = "selo st-" + c.status;
  selo.textContent = c.status;
  tdStatus.appendChild(selo);
  tr.appendChild(tdStatus);

  // Regra do projeto: a paciente só recebe o resultado depois da revisão médica
  tr.appendChild(celula(c.status === "aguardando" ? "Retido até revisão" : "Liberado após revisão"));
  tr.appendChild(celula(c.parecerMedico || "–"));

  const tdAcoes = document.createElement("td");
  tdAcoes.className = "acoes";
  tdAcoes.appendChild(botao("Editar", "btn-sec", () => iniciarEdicao(c)));
  tdAcoes.appendChild(botao("Excluir", "btn-perigo", () => apagar(c)));
  tr.appendChild(tdAcoes);
  return tr;
}

function renderizar() {
  const busca = $("q-busca").value.trim().toLowerCase();
  const status = $("q-status").value;
  const ordem = $("q-ordem").value;

  const lista = casos
    .filter((c) => (!status || c.status === status) && c.codigo.toLowerCase().includes(busca))
    .sort(ordem === "prob"
      ? (a, b) => b.probabilidadeIA - a.probabilidadeIA
      : (a, b) => a.codigo.localeCompare(b.codigo));

  totalFiltrado = lista.length;
  const mostrados = lista.slice(0, visiveis);

  $("corpo-fila").replaceChildren(...mostrados.map(linha));
  $("fila-vazia").hidden = lista.length > 0;
  atualizarContagem(lista.length, mostrados.length);
  atualizarGraficoStatus();
}

// "Mostrando 10 de 40 casos" + botão Ver mais / Ver menos
function atualizarContagem(total, mostrados) {
  $("rodape-tabela").hidden = total <= POR_PAGINA;
  $("contagem-fila").textContent = `Mostrando ${mostrados} de ${total} casos`;
  const todos = mostrados >= total;
  $("btn-mais").textContent = todos ? "Ver menos" : `Ver mais ${Math.min(POR_PAGINA, total - mostrados)}`;
}

function verMaisOuMenos() {
  const todos = visiveis >= totalFiltrado;
  visiveis = todos ? POR_PAGINA : visiveis + POR_PAGINA;
  renderizar();
  if (todos) document.querySelector(".painel-tabela").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------- Gráfico de status (liga o CRUD ao dashboard) ----------
function atualizarGraficoStatus() {
  const nomes = ["aguardando", "confirmado", "descartado"];
  const valores = nomes.map((n) => casos.filter((c) => c.status === n).length);

  if (graficoStatus) graficoStatus.destroy();
  graficoStatus = new Chart($("g-status"), {
    type: "bar",
    data: {
      labels: nomes,
      datasets: [{ data: valores, backgroundColor: nomes.map((n) => COR_STATUS[n]) }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: "Casos da fila por status de revisão" },
        legend: { display: false }
      },
      scales: {
        x: { title: { display: true, text: "Status" } },
        y: {
          beginAtZero: true,
          ticks: { precision: 0 },
          title: { display: true, text: "Número de casos" }
        }
      }
    }
  });
}

// ---------- Ações ----------
async function carregar() {
  try {
    casos = await listar();
    renderizar();
  } catch (e) {
    mensagem("Erro ao carregar a fila: " + e.message, true);
  }
}

function limparFormulario() {
  $("form-caso").reset();
  editandoId = null;
  $("c-municipio").disabled = true;
  $("c-municipio").innerHTML = '<option value="">Selecione</option>';
  $("titulo-form").textContent = "Cadastrar novo caso";
  $("btn-salvar").textContent = "Cadastrar caso";
  $("btn-cancelar").hidden = true;
}

async function iniciarEdicao(c) {
  editandoId = c.objectId;
  $("c-codigo").value = c.codigo;
  $("c-prob").value = c.probabilidadeIA;
  $("c-raio").value = c.raioMedio;
  $("c-uf").value = c.uf || "";
  await carregarMunicipios(c.uf || "", c.municipio || "");
  $("c-status").value = c.status;
  $("c-parecer").value = c.parecerMedico || "";
  $("titulo-form").textContent = "Editar caso " + c.codigo;
  $("btn-salvar").textContent = "Salvar alterações";
  $("btn-cancelar").hidden = false;
  $("form-caso").scrollIntoView({ behavior: "smooth", block: "center" });
}

async function apagar(c) {
  if (!confirm(`Excluir o caso ${c.codigo}?`)) return;
  try {
    await excluir(c.objectId);
    mensagem("Caso excluído.");
    await carregar();
  } catch (e) {
    mensagem("Erro ao excluir: " + e.message, true);
  }
}

async function salvar(evento) {
  evento.preventDefault();
  const caso = {
    codigo: $("c-codigo").value.trim(),
    probabilidadeIA: Number($("c-prob").value),
    raioMedio: Number($("c-raio").value),
    uf: $("c-uf").value,
    municipio: $("c-municipio").value,
    status: $("c-status").value,
    parecerMedico: $("c-parecer").value.trim()
  };

  if (!caso.codigo) return mensagem("Informe o código do caso.", true);
  if (!(caso.probabilidadeIA >= 0 && caso.probabilidadeIA <= 1)) {
    return mensagem("A probabilidade da IA deve estar entre 0 e 1.", true);
  }

  try {
    if (editandoId) {
      await editar(editandoId, caso);
      mensagem("Caso atualizado.");
    } else {
      await criar(caso);
      mensagem("Caso cadastrado.");
    }
    limparFormulario();
    await carregar();
  } catch (e) {
    mensagem("Erro ao salvar: " + e.message, true);
  }
}

async function importarExemplos() {
  if (!confirm(`Importar ${CASOS_SEED.length} casos de exemplo para o Back4App?`)) return;
  const botaoImp = $("btn-importar");
  botaoImp.disabled = true;
  try {
    for (let i = 0; i < CASOS_SEED.length; i++) {
      mensagem(`Importando ${i + 1} de ${CASOS_SEED.length}...`);
      await criar(CASOS_SEED[i]);
    }
    mensagem("Casos de exemplo importados.");
    await carregar();
  } catch (e) {
    mensagem("Erro na importação: " + e.message, true);
  } finally {
    botaoImp.disabled = false;
  }
}

// ---------- Início ----------
function iniciarFila() {
  const configurado = CONFIG.APP_ID && !CONFIG.APP_ID.startsWith("COLE");
  if (!configurado) {
    $("aviso-config").hidden = false;
    $("area-fila").hidden = true;
    return;
  }

  $("form-caso").addEventListener("submit", salvar);
  $("btn-cancelar").addEventListener("click", limparFormulario);
  $("btn-importar").addEventListener("click", importarExemplos);
  $("c-uf").addEventListener("change", (e) => carregarMunicipios(e.target.value));
  ["q-busca", "q-status", "q-ordem"].forEach((id) => {
    $(id).addEventListener("input", () => { visiveis = POR_PAGINA; renderizar(); });
  });
  $("btn-mais").addEventListener("click", verMaisOuMenos);

  limparFormulario();
  carregarEstados();
  carregar();
}

iniciarFila();