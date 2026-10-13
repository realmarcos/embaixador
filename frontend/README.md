# Embaixador Frontend

Frontend Next.js para cadastro, login, análise de mídias, downloads privados, histórico e preferências.

## Requisitos

- Node.js `24.18.0` (faixa declarada: `>=24 <25`)
- Yarn `1.22.22`
- Backend disponível em `http://localhost:8080/api`

## Desenvolvimento

```sh
yarn install --frozen-lockfile
yarn dev
```

Abra `http://localhost:3000`. Para apontar a API a outro endereço, defina `NEXT_PUBLIC_API_BASE_URL` antes de iniciar o servidor, por exemplo `http://localhost:8080/api`.

O cliente sempre envia `credentials: "include"`. A sessão fica somente no cookie HttpOnly emitido pelo backend; o frontend não armazena tokens em `localStorage` ou `sessionStorage`.

## Verificação

```sh
yarn test
yarn lint
yarn build
```

Os testes usam o runner nativo do Node 24 e não adicionam dependências de teste.
