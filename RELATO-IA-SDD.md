# Minha experiência com IA e SDD

Esse é um relatório sincero sobre o uso de inteligência artificial no desenvolvimento de software orientado a especificações (SDD), utilizando a ferramenta [Spec Kit](https://github.github.com/spec-kit/index.html).

## A ideia

A ideia do projeto é bem simples, com poucos requisitos no geral. Seu maior propósito é o **aprendizado**, tanto da metodologia **SDD** quanto da ferramenta **Spec Kit**.

A ideia central consiste em desenvolver um software capaz de baixar mídias de plataformas como *Instagram*, *Facebook* e *YouTube*, permitindo também converter os arquivos originais para outros formatos.

Os requisitos do projeto se resumem a:

- Analisar e baixar mídias.
- Converter mídias para outros formatos.
- Garantir a segurança e o anonimato dos downloads.
- Organizar o histórico de downloads.

Em resumo, considerando todos os requisitos técnicos, funcionais e não funcionais, não chegamos a mais de 20 requisitos no total.

## Especificações

O projeto originalmente possui as seguintes **dependências técnicas**:

| Área | Tecnologias |
|---|---|
| Runtime | Node.js 24.18.0 (`>=24 <25`) |
| Backend | TypeScript 6, Express 5, Prisma 6.12 e MySQL |
| Frontend | Next.js 16, React 19, Tailwind CSS 4 e Base UI |
| Testes | Vitest 5 no backend e runner nativo do Node.js 24 no frontend |
| Armazenamento | AWS SDK for JavaScript v3 e serviço ou bucket compatível com S3 |
| Sessão e segurança | JOSE/JWT, cookies seguros, criptografia da URL de origem, validação de URLs e proxy de egress |
| Ferramentas externas | `yt-dlp` e FFmpeg, instalados separadamente do npm/Yarn |
| Gerenciadores de pacotes | npm no backend e Yarn 1.22.22 no frontend |

As dependências JavaScript e TypeScript estão declaradas nos *manifests* e *lockfiles* de cada pacote. Já o `yt-dlp`, o FFmpeg, o MySQL e o serviço compatível com S3 são dependências externas.

Agora, tratando de arquitetura e metodologias, a primeira abordagem definida foi o **SDD (Spec-Driven Development)**, ou desenvolvimento orientado a especificações, que serve como princípio para desenvolver software utilizando inteligência artificial.

A metodologia XP também foi utilizada, mais especificamente por meio do conceito de *Pair Programming*. Nesse modelo, eu, como programador, assumo o papel de arquiteto e engenheiro de software, tomando decisões que impactam a qualidade, a segurança, a viabilidade e a escalabilidade do software. Enquanto isso, a inteligência artificial assume o papel operacional de escrever o código seguindo as orientações fornecidas, como se fosse um programador júnior recebendo instruções e metas.

Além dessas abordagens, foram definidos alguns princípios e práticas adicionais.

Um deles é o **TDD (Test-Driven Development)**, ou desenvolvimento orientado a testes, com o objetivo de alcançar uma cobertura próxima de 100% no backend por meio de testes automatizados.

Outro é um conceito que vem do **Clean Architecture**, o *factories* e outros princípios do **SOLID**, como o princípio da responsabilidade única, a inversão de dependência e a injeção de dependência. Também foi estabelecida a preocupação com nomes de métodos e variáveis bem definidos, claros e sem ambiguidades.

Em resumo, as principais práticas e os princípios adotados são:

- SDD (*Spec-Driven Development*).
- TDD (*Test-Driven Development*).
- Clean Architecture.
- Princípio da responsabilidade única.
- *Factories*.
- Inversão e injeção de dependência.
- Nomes de métodos e variáveis claros e sem ambiguidades.

## Vantagens e desvantagens

Ao longo do desenvolvimento, encontrei alguns elementos que considero positivos e negativos no uso da inteligência artificial com desenvolvimento orientado a especificações (SDD).

### Desvantagens

- **Subjetividade e ambiguidade:** as especificações podem ser interpretadas de maneiras diferentes, gerando resultados que não correspondem exatamente ao que foi solicitado. Isso pode acontecer tanto quando os requisitos não são detalhados o suficiente quanto quando são detalhados em excesso, criando barreiras desnecessárias para a implementação de determinadas funcionalidades. No fim, essas situações podem comprometer o projeto e atrasar o desenvolvimento.

  Em algumas ocasiões, é possível contornar esses problemas utilizando recursos do Spec Kit, como o comando `/speckit.analyze`, que ajuda a identificar inconsistências, ambiguidades e lacunas nas especificações. Ainda assim, a abordagem mais assertiva é documentar e detalhar os requisitos antes de repassá-los à IA, buscando sempre uma comunicação objetiva e precisa. Claro que nem preciso mencionar a importância de conhecer os conceitos de engenharia de software para conseguir identificar, analisar e detalhar esses requisitos.

- **Definições iniciais exigentes:** uma boa especificação depende de uma análise cuidadosa dos requisitos, o que exige conhecimento técnico e tempo de planejamento. Sei que, às vezes, ficamos ansiosos para colocar a mão na massa e ver o projeto rodando, mas precisamos nos dedicar de verdade à etapa inicial, quando definimos as especificações do projeto.

  Algumas pessoas já ouviram a seguinte frase: *"Se eu tivesse apenas uma hora para derrubar uma árvore, passaria os primeiros 45 minutos afiando meu machado."* A ideia é simples: uma boa preparação pode determinar a qualidade e a eficiência das etapas seguintes.

  E aí eu pergunto: é melhor passar 10 minutos afiando o machado e gastar os outros 50 tentando cortar a árvore e sempre voltar a afiar o machado, ou dedicar 45 minutos à preparação e derrubar a árvore nos 15 minutos restantes, talvez até menos? No desenvolvimento de software, o raciocínio é parecido. Investir tempo no planejamento pode evitar retrabalho, reduzir erros e tornar a implementação muito mais eficiente.

- **Gastos com tokens:** especificações incompletas ou mal definidas podem gerar retrabalho, novas interações com a IA e, consequentemente, maior consumo de tokens. Existem alguns modelos de IA que podemos chamar de *devoradores de tokens*, pois, por mais simples que sejam determinadas tarefas, eles ainda conseguem consumir uma quantidade absurda de recursos.

  Quando falamos de desenvolvimento com IA, também precisamos falar de economia, eficiência e qualidade. Não explorei tanto as diferentes estratégias para reduzir esse consumo, mas, na minha experiência, procurei me concentrar em boas especificações e na utilização de arquivos Markdown para organizar e documentar as informações do projeto.

### Vantagens

- **Aumento da produtividade:** a IA facilita a implementação de requisitos de qualidade, como testes unitários e testes de integração, tornando mais viável investir em práticas que muitas vezes acabam ficando em segundo plano por causa dos prazos de desenvolvimento.

  Além disso, a IA torna muito mais prática a adoção de arquiteturas e padrões de projeto que, em determinadas situações, acabam sendo deixados de lado pela falta de tempo. Ela se destaca principalmente em tarefas que seguem padrões bem definidos, como a criação de testes automatizados, dados de teste (*fake data*), refatorações e a aplicação de padrões já estabelecidos no projeto.

- **Potencialização do conhecimento:** a IA potencializa aquilo que você já sabe. É tipo o soro do super-soldado. Como dizia o Dr. Erskine em *Capitão América: O Primeiro Vingador*: *"O soro amplifica tudo o que está lá dentro. O bem se torna ótimo. O mal se torna pior."*

  Se você possui um conhecimento amplo sobre construção de software, a IA pode impactar positivamente diversos aspectos do desenvolvimento, permitindo que você trabalhe com mais produtividade e dedique mais tempo às decisões que realmente importam. Por outro lado, se uma pessoa sem conhecimento técnico suficiente utilizar a IA para construir software, o resultado também poderá ser excepcionalmente ruim, principalmente quando não houver capacidade de avaliar a qualidade do que foi produzido.

  Por sorte, com a evolução das ferramentas de IA, até mesmo pessoas com pouca experiência conseguem construir softwares razoáveis. Isso acontece porque a IA pode assumir parte do trabalho operacional e ajudar a implementar determinados requisitos, mesmo quando o usuário ainda não domina todos os aspectos técnicos envolvidos. No entanto, existe uma diferença importante entre conseguir construir algo que funciona e construir um software que seja seguro, confiável, escalável e fácil de manter. **É justamente nessa diferença que o conhecimento de engenharia de software continua fazendo toda a diferença**.

## Veredito

Apesar do desafio de estar aprendendo a utilizar uma nova ferramenta, consigo ter uma visão muito mais ampla dos benefícios da inteligência artificial no desenvolvimento de software. E falo de uma visão de verdade, não daquela ladainha que alguns *vibe coders* costumam repetir.

A inteligência artificial, utilizada nesse contexto e combinada com conhecimentos de arquitetura e engenharia de software, pode trazer vantagens significativas para a construção de software com qualidade a longo prazo.

**O foco precisa estar no longo prazo. Quando o software é bem construído, esse investimento tende a trazer retorno.**

Sempre digo: *"Qualquer idiota consegue escrever código."*

Isso significa que aprender a sintaxe de uma linguagem de programação é relativamente fácil. Difícil mesmo é construir um software de qualidade, capaz de evoluir sem se tornar uma fonte constante de problemas ao longo do tempo.

Da mesma forma, quando falamos de programar usando IA, qualquer um com meio neurônio consegue elaborar um *prompt* capaz de gerar um software. Mas ficam alguns questionamentos: **esse software é realmente útil para o contexto em questão? Ele atende aos requisitos de qualidade necessários?**

Claro que não estou dizendo que pessoas com menos habilidades não deveriam construir softwares, mas que elas deveriam ter consciência da complexidade da sua construção para determinados contextos.

Uma IA pode servir muito bem para criar um *MVP* em poucos instantes, desenvolver um projeto para uma disciplina da faculdade ou até mesmo materializar aquela ideia que você teve no último final de semana.

Mas, quando tratamos o software como um produto que será utilizado em ambientes reais, a situação muda por completo. Assim como qualquer outro produto, um software precisa atender a requisitos de qualidade.

Se você desconhece esses requisitos, aqui estão alguns deles:

- **Escalabilidade:** capacidade de lidar com o crescimento da demanda sem comprometer o funcionamento do sistema.
- **Segurança:** envolve muito mais elementos do que muita gente imagina, desde a validação de entradas até o controle de acesso e a proteção de dados.
- **Usabilidade:** não se resume a ter uma interface bonita; envolve proporcionar uma experiência intuitiva e eficiente para o usuário.
- **Desempenho:** as pessoas são impacientes. Um sistema lento pode comprometer a experiência e até afastar usuários.
- **Manutenibilidade:** capacidade de corrigir, modificar e evoluir o software sem transformar cada mudança em um novo problema.
- **Confiabilidade:** capacidade de funcionar de maneira consistente, previsível e correta ao longo do tempo.

No fim das contas, é justamente nesse ponto que acredito estar o grande diferencial do uso da IA aliado ao SDD e às boas práticas de engenharia de software. Não se trata apenas de produzir mais código em menos tempo, mas de **construir software com qualidade, propósito e capacidade de evoluir a longo prazo**.
