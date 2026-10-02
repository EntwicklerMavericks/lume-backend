<div align="center">

  <img src="https://nestjs.com/img/logo-small.svg" alt="NestJS Logo" width="100" />

  # ⚡ LUME — BACKEND API
  ### *RESTful API de Alta Performance para E-Commerce de Moda Urbana*

  [![NestJS](https://img.shields.io/badge/NestJS-11.0-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)](https://nestjs.com/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![Prisma](https://img.shields.io/badge/Prisma-6.0-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](https://www.prisma.io/)
  [![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1?style=for-the-badge&logo=mysql&logoColor=white)](https://www.mysql.com/)
  [![JWT](https://img.shields.io/badge/Auth-JWT-black?style=for-the-badge&logo=jsonwebtokens&logoColor=white)](https://jwt.io/)

  <br />

  <p align="center">
    <strong>API REST robusta construída com NestJS, Prisma ORM e MySQL, fornecendo serviços de autenticação, catálogo de produtos, gerenciamento de categorias e suporte a uploads de alta resolução.</strong>
  </p>

</div>

---

## 📌 Visão Geral

O backend da **Lume** foi desenvolvido seguindo os princípios de **Clean Architecture** e modularidade do NestJS. Ele atende tanto a vitrine pública de alta performance quanto o painel administrativo restrito do lojista.

### Destaques da Implementação:
- **Suporte a Alto Volume de Dados (Payloads de 50MB)**: Configurado com parsers expandidos para suportar uploads de imagens em alta definição e catálogos volumosos.
- **Armazenamento Otimizado**: Colunas de imagens em `LONGTEXT` no MySQL para persistência sem risco de truncamento.
- **Autenticação Segura & RBAC**: Controle de acesso baseado em papéis (`ADMIN` e `CUSTOMER`) via JSON Web Tokens e Passport.
- **Validação Rigorosa**: Pipes globais com `class-validator` e `class-transformer` para higienização e validação de DTOs.

---

## 🛠️ Tecnologias & Bibliotecas

- **Framework**: [NestJS 11](https://nestjs.com/)
- **Linguagem**: [TypeScript 5.7](https://www.typescriptlang.org/)
- **ORM**: [Prisma 6](https://www.prisma.io/)
- **Banco de Dados**: [MySQL 8.0](https://www.mysql.com/)
- **Autenticação**: `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt`, `bcrypt`
- **Validação**: `class-validator`, `class-transformer`
- **CORS & Segurança**: Headers seguros e controle de origens permitidas via variáveis de ambiente

---

## 📁 Estrutura de Pastas

```text
src/
├── auth/                      # Módulo de Autenticação (Login, Registro, JWT)
│   ├── dto/                   # DTOs de login e registro
│   ├── guards/                # JwtAuthGuard, RolesGuard
│   ├── strategies/            # JwtStrategy
│   ├── auth.controller.ts
│   └── auth.service.ts
├── common/                    # Filtros, interceptors e decorators globais
│   ├── decorators/            # @CurrentUser(), @Roles()
│   ├── filters/               # HttpExceptionFilter global
│   └── interceptors/          # LoggingInterceptor
├── categories/                # Módulo de Categorias
│   ├── dto/                   # CreateCategoryDto, UpdateCategoryDto
│   ├── categories.controller.ts
│   └── categories.service.ts
├── products/                  # Módulo de Produtos & Variações
│   ├── dto/                   # CreateProductDto, UpdateProductDto
│   ├── products.controller.ts
│   └── products.service.ts
├── users/                     # Módulo de Usuários
├── prisma/                    # Serviço e cliente do Prisma ORM
│   ├── prisma.module.ts
│   └── prisma.service.ts
├── app.module.ts              # Módulo raiz da aplicação
└── main.ts                    # Bootstrap com CORS, pipes globais e limites de 50MB
```

---

## 🗄️ Modelo de Dados (Prisma Schema)

```prisma
model User {
  id        String   @id @default(uuid())
  name      String
  email     String   @unique
  password  String
  role      String   @default("CUSTOMER") // "ADMIN" ou "CUSTOMER"
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
}

model Category {
  id          String    @id @default(uuid())
  name        String
  slug        String    @unique
  description String?   @db.Text
  image       String?   @db.LongText
  products    Product[]
  createdAt   DateTime  @default(now())
}

model Product {
  id               String         @id @default(uuid())
  name             String
  slug             String         @unique
  sku              String         @unique
  description      String?        @db.Text
  price            Decimal        @db.Decimal(10, 2)
  promotionalPrice Decimal?       @db.Decimal(10, 2)
  stock            Int            @default(0)
  status           Boolean        @default(true)
  gender           String         @default("Masculino")
  highlight        Boolean        @default(false)
  newLaunch        Boolean        @default(false)
  sizes            Json?
  colors           Json?
  categoryId       String
  category         Category       @relation(fields: [categoryId], references: [id])
  images           ProductImage[]
  createdAt        DateTime       @default(now())
}

model ProductImage {
  id        String   @id @default(uuid())
  url       String   @db.LongText
  isMain    Boolean  @default(false)
  order     Int      @default(0)
  productId String
  product   Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
}
```

---

## 🔌 Principais Endpoints da API

| Método | Rota | Descrição | Acesso |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Autenticação e retorno de Token JWT | Público |
| `POST` | `/api/auth/register` | Registro de novo usuário | Público |
| `GET` | `/api/products` | Listagem de produtos (filtros por categoria, gênero, status) | Público |
| `GET` | `/api/products/:id` | Detalhes do produto por ID | Público |
| `GET` | `/api/products/slug/:slug` | Detalhes do produto por Slug amigável | Público |
| `POST` | `/api/products` | Cadastro de novo produto | Admin (JWT) |
| `PATCH` | `/api/products/:id` | Atualização de produto | Admin (JWT) |
| `PATCH` | `/api/products/:id/toggle-status` | Ativação/inativação de produto | Admin (JWT) |
| `DELETE` | `/api/products/:id` | Exclusão de produto | Admin (JWT) |
| `GET` | `/api/categories` | Listagem de categorias com contagem de produtos | Público |
| `POST` | `/api/categories` | Cadastro de categoria | Admin (JWT) |
| `PATCH` | `/api/categories/:id` | Atualização de categoria | Admin (JWT) |
| `DELETE` | `/api/categories/:id` | Exclusão de categoria | Admin (JWT) |

---

## 🚀 Como Executar

### 1. Instalação
```bash
npm install
```

### 2. Configurar Variáveis de Ambiente (.env)
Crie um arquivo `.env` na raiz do backend:
```env
# Banco de Dados (MySQL 8.0)
DATABASE_URL="mysql://root:sua_senha@localhost:3306/lume_store"

# Autenticação JWT
JWT_SECRET="sua_chave_super_secreta_lume_store_jwt_token_2026"
JWT_EXPIRES_IN="1d"

# Servidor
PORT=3000
ALLOWED_ORIGINS="http://localhost:4200"
```

### 3. Sincronizar Banco com Prisma
```bash
npx prisma db push
```

### 4. Iniciar Servidor
```bash
# Modo desenvolvimento (watch)
npm run start:dev

# Modo produção
npm run build
npm run start:prod
```

---

## 👨‍💻 Desenvolvedor & Contato Comercial

Desenvolvido por **Eduardo Theodoro**.

<div align="center">

  [![LinkedIn](https://img.shields.io/badge/LinkedIn-Eduardo%20Theodoro-0077B5?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/eduardot97)
  [![WhatsApp](https://img.shields.io/badge/WhatsApp-Conversar%20no%20WhatsApp-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)](https://wa.me/5511961742713?text=Ol%C3%A1%20Eduardo,%20vim%20pelo%20Lume%20Backend!)
  [![E-mail 1](https://img.shields.io/badge/E--mail-entwicklermavericks%40gmail.com-D14836?style=for-the-badge&logo=gmail&logoColor=white)](mailto:entwicklermavericks@gmail.com)
  [![E-mail 2](https://img.shields.io/badge/E--mail-eduardotheodorofegit%40gmail.com-EA4335?style=for-the-badge&logo=gmail&logoColor=white)](mailto:eduardotheodorofegit@gmail.com)

</div>

<br />

| Canal | Informação / Link Direto |
| :--- | :--- |
| 👤 **Nome** | **Eduardo Theodoro** |
| 💼 **LinkedIn** | [linkedin.com/in/eduardot97](https://www.linkedin.com/in/eduardot97) |
| 📱 **WhatsApp** | [**+55 (11) 96174-2713**](https://wa.me/5511961742713?text=Ol%C3%A1%20Eduardo,%20vim%20pelo%20Lume%20Backend!) |
| 📧 **E-mail Principal** | [entwicklermavericks@gmail.com](mailto:entwicklermavericks@gmail.com) |
| 📧 **E-mail Dev / Git** | [eduardotheodorofegit@gmail.com](mailto:eduardotheodorofegit@gmail.com) |
| 🛡️ **Licença** | Privada / Comercial |

---

<div align="center">
  <sub>© 2026 Lume Commerce — Todos os direitos reservados.</sub>
</div>
