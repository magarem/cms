# 🛸 Sirius Eco-System: Delivery API (Port 8081)

O **Server Delivery** é o motor de leitura otimizado para os sites finais (Frontend). Ele é estritamente **Read-Only** (apenas métodos `GET`) e foca em alta performance para entregar o conteúdo processado aos clientes finais (ex: Índia Sagrada, Nova Gokula, etc).

---

### 🛡️ Identificação de Contexto (O "Radar" Global)
Para não precisar repetir parâmetros em todas as chamadas, o servidor identifica qual site deve acessar para **todas as rotas abaixo** seguindo esta rigorosa ordem de prioridade:
1. **URL Query:** `?site=nome-do-site` (Prioridade máxima, força a troca de contexto).
2. **HTTP Header:** `x-cms-site: nome-do-site` (Padrão e recomendado para chamadas de API via `$fetch` do Nuxt).
3. **Cookie:** `cms_site_context=nome-do-site` (Útil para navegação persistente e admin).

---

## 📌 1. Conteúdo de Página (`/api/content`)
Recupera os metadados (frontmatter) e o corpo de uma página específica.

* **Endpoint:** `GET /api/content/*`

### Parâmetros de Query:
| Parâmetro | Tipo | Obrigatório | Descrição |
| :--- | :--- | :--- | :--- |
| `preview` | `boolean` | Não | `true`: Lê da pasta `/content` (Rascunho na hora). `false`: Lê da pasta `/data` (Produção Compilada). |

### Exemplo de Requisição:
`GET http://localhost:8081/api/content/contact?site=novagokula`

### Estrutura de Retorno (JSON):
```json
{
  "data": {
    "title": "Contato",
    "description": "Fale conosco",
    "layout": "default"
  },
  "body": { ... }, 
  "_path": "/contact",
  "_source": "cms-compiled",
  "_extension": "json"
}
```

---

## 📌 2. Listagem de Seção (`/api/superlist`)

O endpoint `superlist` é o motor de coleções do Sirius. Ele não entrega o corpo completo (body) dos arquivos, mas sim um índice (array) com o `frontmatter` de todos os arquivos dentro de uma subpasta específica.

* **Endpoint:** `GET /api/superlist`
* **Escopo:** Atua exclusivamente dentro do diretório `/content` do site selecionado.
* **Uso Comum:** Criar listas de posts de blog, membros de equipe, depoimentos ou itens de uma galeria.

### Parâmetros de Query:
| Parâmetro | Tipo | Obrigatório | Descrição |
| :--- | :--- | :--- | :--- |
| `section` | **string** | **Sim** | Nome da subpasta dentro de `/content` (ex: `blog`, `equipe`). |

### Exemplo de Fluxo:
Requisição: `GET /api/superlist?site=novagokula&section=sobre`
1. O servidor acessa: `storage/novagokula/content/sobre/`
2. Varre todos os arquivos (`.md`, `.toml`, `.json`).
3. Extrai apenas os metadados do topo de cada arquivo.
4. Retorna um Array ordenado pronto para iteração no Frontend.

---

## 📌 3. Servidor de Assets (`/assets`)

O endpoint de Assets funciona como um **Static File Server** especializado de altíssima velocidade. Ele mapeia URLs virtuais para arquivos físicos de mídia dentro do storage de cada site usando `Bun.file()`.

* **Endpoint:** `GET /assets/*` *(Nota: Não utiliza o prefixo /api)*
* **Pasta Alvo:** `/storage/[site]/content/`

### Exemplo de Funcionamento:
Se o site solicitar uma imagem armazenada na pasta do bistrô:
`URL: http://localhost:8081/assets/atrativos/alimentacao/bistro/foto.jpg?site=novagokula`

O servidor resolve internamente e entrega os bytes reais de:
`Caminho: /storage/novagokula/content/atrativos/alimentacao/bistro/foto.jpg`

### Detalhes Técnicos:
* **MIME Types:** O servidor detecta automaticamente se o arquivo é `image/jpeg`, `image/png`, `application/pdf`, etc., e envia o header correto para o navegador.
* **Cache:** Implementa headers de cache (`public, max-age=86400`) para evitar que o navegador baixe a mesma imagem repetidamente. No modo de edição (`?preview=true`), o cache é desativado para forçar a atualização.
* **Segurança:** Bloqueia qualquer tentativa de *Path Traversal* (usar `..` na URL) para acessar arquivos fora do diretório permitido do site.

---

## 📌 4. Árvore de Diretórios (`/api/list`)

Varre o sistema de arquivos para retornar a estrutura de pastas e arquivos. Foi projetado sob medida para alimentar componentes de UI em árvore (ex: PrimeVue Tree).

* **Endpoint:** `GET /api/list`

### Parâmetros de Query:
| Parâmetro | Tipo | Obrigatório | Descrição |
| :--- | :--- | :--- | :--- |
| `dir` | `string` | Não | Subpasta inicial dentro de `/content`. O padrão é a raiz do content. |
| `deep` | `string` | Não | `one` (Apenas o nível atual) ou `all` (Mergulho Recursivo). |
| `node` | `string` | Não | **Seletor Cirúrgico:** Extrai apenas uma propriedade, array ou índice específico da resposta. |

### O Seletor Cirúrgico (`node`):
Permite comportamento semelhante ao GraphQL, trafegando apenas o dado exato que o Frontend precisa. Aceita navegação profunda por matrizes e objetos (Notação de Ponto e Colchetes).

**Exemplos de uso do `node`:**
* `?dir=bistro` ➔ Retorna o objeto completo `{ site, dir, tree: [...] }`
* `?dir=bistro&node=tree` ➔ Retorna apenas o Array limpo `[ ... ]` (Ideal para Lazy Loading).
* `?dir=bistro&node=tree[0]` ➔ Retorna apenas o JSON do 1º arquivo do diretório.
* `?dir=bistro&node=tree[0].name` ➔ Retorna apenas a string do nome do 1º arquivo (ex: `"foto.jpg"`).

### Exemplo de Retorno Padrão (Sem a flag 'node'):
```json
{
  "site": "novagokula",
  "dir": "blog",
  "tree": [
    { 
      "key": "/blog/artigos", 
      "name": "artigos", 
      "type": "directory", 
      "path": "/blog/artigos", 
      "children": [] 
    },
    { 
      "key": "/blog/index.md", 
      "name": "index.md", 
      "type": "file", 
      "extension": "md", 
      "path": "/blog/index.md",
      "size": 1024
    }
  ]
}
```

---

## ⚙️ Regras de Resolução de Caminhos (Paths)

Para garantir a "Arrumação de Casa", o Server Delivery segue esta hierarquia de busca quando recebe uma requisição:

1.  **Prioridade de Extensão (Content):** `.json` (Compilado) > `.toml` > `.yaml` > `.md` (Markdown Puro).
2.  **Normalização Multi-OS:** Todos os caminhos na API de Listagem são convertidos ativamente para usar barras normais (`/`), evitando quebras de string entre o sistema de arquivos de desenvolvimento (Mac) e o de produção (Linux/Hostinger).