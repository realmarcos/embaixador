<!--
Sync Impact Report
Version change: unresolved template -> 1.0.0 (initial populated constitution)
Modified principles: none; ten principles adopted from project requirements
Added sections: Objetivo e Confidencialidade; Fluxo de Desenvolvimento e Qualidade
Removed sections: none
Follow-up TODOs: confirm the original ratification date
-->
# Constituição do embaixador

## Princípios Fundamentais

### I. Monorepo com responsabilidades separadas

O repositório MUST manter backend e frontend em áreas com responsabilidades
separadas. Mudanças em contratos compartilhados MUST manter a compatibilidade
entre ambos ou atualizar as partes afetadas na mesma alteração, com verificação
do contrato.

### II. Dependências de terceiros sob autorização

O projeto MUST prefer recursos nativos e código já existente. Adicionar ou
atualizar uma dependência direta de terceiros requer autorização explícita antes
da mudança; a justificativa e o impacto da dependência MUST ser documentados.

### III. Autonomia restrita a mudanças autorizadas

Testes, refatorações mecânicas e ajustes de consistência que preservem o
comportamento e os padrões existentes podem ser realizados sem autorização
adicional. Qualquer mudança fora dessas categorias MUST permanecer dentro do
escopo explicitamente autorizado.

### IV. Decisões de arquitetura e prioridades pertencem ao usuário

Decisões de arquitetura MUST receber autorização explícita antes da execução.
O agente MUST respeitar a prioridade e a ordem solicitadas, sem substituir ou
reordenar o trabalho por preferência própria. Riscos, bloqueios e dependências
objetivas podem ser apresentados para decisão do usuário.

### V. Documentação técnica acompanha a evolução

Mudanças MUST atualizar a documentação técnica afetada quando alterarem
comportamento, contratos, configuração, operação ou decisões documentadas.

### VI. Otimização para exclusão e simplicidade

Módulos MUST permanecer pequenos o suficiente para que um engenheiro do projeto
possa removê-los e reescrevê-los em um dia de trabalho sem mudanças não
relacionadas. O projeto MUST rejeitar abstrações especulativas; para menos de
três ocorrências, duplicação explícita MUST ser preferida a uma abstração sem
necessidade demonstrada.

### VII. Dependências explícitas

Funções MUST expor suas dependências nas assinaturas ou no início do arquivo.
O código MUST evitar acoplamento oculto, estado global implícito e efeitos
colaterais no momento da importação.

### VIII. Cobertura de testes unitários no backend

Cada requisito implementado no backend MUST ter testes unitários, incluindo
casos extremos relevantes. A cobertura MUST se manter próxima de 100%; lacunas
remanescentes MUST ser identificadas e justificadas, sem substituir testes
significativos por cobertura artificial.

### IX. Qualidade verificável por pacote

Cada pacote alterado MUST passar seus próprios testes, lint e build antes de a
mudança ser considerada pronta. Alterações de contratos compartilhados MUST
também verificar a compatibilidade entre backend e frontend.

### X. Segurança por padrão

Dados de entrada MUST ser validados, segredos MUST permanecer fora do código,
logs e respostas, e erros MUST ser tratados sem revelar informação sensível.
O tratamento de mídia e metadados MUST preservar a confidencialidade dos
downloads dos usuários.

## Objetivo e Confidencialidade

O embaixador é uma ferramenta para baixar mídias de sites como YouTube,
Instagram e Facebook, com confidencialidade para o que os usuários baixam.
Coletar, registrar, expor ou compartilhar conteúdo, URLs privadas e metadados
de download MUST ser limitado ao estritamente necessário para a funcionalidade
autorizada. Qualquer decisão arquitetural ou integração que altere esse limite
requer autorização explícita.

## Fluxo de Desenvolvimento e Qualidade

O trabalho MUST respeitar o escopo autorizado e os princípios acima. Antes de
considerar uma mudança concluída, o pacote afetado MUST passar testes, lint e
build; mudanças de backend MUST verificar os requisitos implementados e seus
casos extremos. A revisão MUST confirmar compatibilidade entre as áreas do
monorepo quando contratos compartilhados forem afetados, tratamento seguro de
dados e atualização da documentação técnica aplicável. Falhas ou verificações
indisponíveis MUST ser comunicadas, não presumidas como aprovadas.

## Governance

Esta constituição prevalece sobre práticas incompatíveis do projeto. Alterações
nela MUST ser propostas com justificativa, impacto nos princípios e aprovação
explícita do usuário ou mantenedor responsável. Revisões de mudanças MUST
verificar conformidade com os princípios aplicáveis e registrar exceções e suas
justificativas.

O versionamento segue SemVer: MAJOR para remoção ou redefinição incompatível de
princípios, MINOR para novos princípios ou expansão material das regras e PATCH
para esclarecimentos sem mudança de obrigação. Toda alteração MUST atualizar a
versão e a data de última emenda. Mudanças com impacto operacional MUST incluir
as etapas de migração necessárias.

**Version**: 1.0.0 | **Ratified**: TODO(RATIFICATION_DATE): data original não registrada | **Last Amended**: 2026-10-07
