# Feature Specification: Opções Padrão de Formato para Download

**Feature Branch**: `002-formatos-padrao-download`

**Created**: 2026-10-09

**Status**: Draft

**Input**: User description: "Criar um mecanismo com opções padrão de formato para baixar mídias: áudio MP3, áudio MP4, vídeo MP4 nas resoluções 240p, 360p, 480p, 720p, 1080p, 1440p, 2K e 4K, além do formato original. As opções devem ser disponibilizadas conforme os dados analisados da mídia; se a origem tiver 720p, oferecer 720p e resoluções inferiores."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Escolher um formato padrão compatível (Priority: P1)

Uma pessoa autenticada analisa uma mídia e recebe uma lista familiar de formatos de áudio, vídeo e original, limitada ao que a origem e os recursos de conversão disponíveis permitem produzir. Ela escolhe uma opção e inicia o download.

**Why this priority**: Uma lista previsível de opções reduz a necessidade de interpretar dezenas de formatos técnicos do provedor e é o objetivo central da feature.

**Independent Test**: Analisar mídias com diferentes capacidades de áudio e vídeo; comparar as opções apresentadas com o catálogo padrão e escolher uma opção compatível para baixar.

**Acceptance Scenarios**:

1. **Given** uma mídia analisada que contém áudio e vídeo com resolução máxima de 720p, **When** a pessoa abre as opções, **Then** vê áudio MP3, áudio em contêiner MP4 quando produzível, vídeo MP4 até 720p e o original quando disponível; não vê opções de vídeo acima de 720p.
2. **Given** uma mídia cuja resolução máxima analisada é inferior a 720p, **When** a pessoa abre as opções, **Then** vê somente resoluções de vídeo iguais ou inferiores à capacidade da origem.
3. **Given** uma mídia sem trilha de áudio, **When** a pessoa abre as opções, **Then** as opções de áudio não são apresentadas.
4. **Given** uma mídia que permite áudio e vídeo, **When** a pessoa seleciona áudio MP3 ou áudio MP4, **Then** o arquivo produzido contém áudio sem trilha de vídeo.
5. **Given** uma mídia com opção original disponível, **When** a pessoa seleciona original, **Then** a mídia é baixada sem transcodificação e preserva o contêiner e as características originais disponíveis.
6. **Given** a pessoa seleciona uma resolução de vídeo MP4 disponível, **When** o download conclui, **Then** o arquivo usa o contêiner MP4 e não excede a resolução selecionada.
7. **Given** a mídia ou a capacidade de conversão não permite produzir uma opção do catálogo, **When** as opções são apresentadas ou o download é iniciado, **Then** a opção incompatível não é oferecida e a ferramenta informa falhas de disponibilidade sem expor dados privados.
8. **Given** uma conversão para resolução inferior, **When** o arquivo é produzido, **Then** a proporção da imagem é preservada e os pixels da imagem-fonte não são ampliados além das dimensões originais; barras pretas podem completar o quadro DCI 2K.
9. **Given** um download concluído, **When** a pessoa consulta seu registro, **Then** o formato e a resolução selecionados correspondem ao arquivo disponibilizado.

### Edge Cases

- A análise não consegue determinar se a mídia contém áudio ou vídeo.
- A origem oferece apenas resoluções inferiores às opções mínimas do catálogo.
- O original não está disponível, ou seu contêiner não pode ser mantido.
- A análise indica uma capacidade que muda ou deixa de estar disponível antes do início do download.
- A opção de conversão falha depois de ter sido apresentada; a pessoa recebe uma mensagem segura e nenhum arquivo parcial fica disponível.
- A mídia é retrato, quadrada, tem dimensões desconhecidas ou possui proporção que exige preservar o enquadramento ao reduzir a resolução.
- Uma origem com resolução vertical inferior a 1080p não pode produzir DCI 2K sem ampliar a imagem e não recebe esse preset. Se a imagem couber sem ampliação em 2048×1080, barras pretas centralizadas completam o quadro quando necessário.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A ferramenta MUST apresentar um catálogo padrão de opções de mídia após analisar uma origem acessível e autorizada.
- **FR-002**: O catálogo MUST incluir áudio MP3, áudio em contêiner MP4, vídeo em contêiner MP4 nas resoluções 240p, 360p, 480p, 720p, 1080p, 1440p, 2K e 4K, e formato original quando cada opção puder ser produzida.
- **FR-003**: As opções de áudio MUST ser exibidas somente quando a análise identificar áudio disponível e MUST produzir arquivo sem trilha de vídeo.
- **FR-004**: A opção 2K MUST representar um quadro de 2048×1080 (DCI), distinto de 1440p. O catálogo MUST NOT oferecer uma opção que exija ampliar os pixels da imagem-fonte; para DCI 2K, MUST centralizar a imagem sem distorção e completar o quadro com barras pretas quando necessário.
- **FR-005**: Quando a origem for 720p, o catálogo MUST oferecer vídeo MP4 em 240p, 360p, 480p e 720p, desde que cada saída possa ser produzida, e MUST omitir as resoluções superiores.
- **FR-006**: Quando houver capacidade de conversão, a ferramenta MUST permitir reduzir a resolução, preservando a proporção da imagem e sem ampliar os pixels da imagem-fonte. O quadro de saída DCI 2K pode ser maior que a largura da imagem-fonte somente para acomodar barras pretas, sem ampliar o conteúdo.
- **FR-007**: A opção original MUST preservar o contêiner e as características originais disponíveis e MUST evitar conversão, sendo omitida quando não puder ser produzida.
- **FR-008**: A seleção MUST permanecer vinculada às opções efetivamente analisadas para aquela mídia; a ferramenta MUST revalidar disponibilidade antes de iniciar o download.
- **FR-009**: O formato e a resolução escolhidos MUST ser refletidos no arquivo concluído e no registro visível à pessoa proprietária.
- **FR-010**: Uma opção de formato indisponível, uma análise incompleta ou uma conversão malsucedida MUST gerar uma mensagem compreensível sem expor URL privada, credenciais ou saída bruta do provedor.

### Key Entities *(include if data involved)*

- **Preset de formato**: opção compreensível para a pessoa, composta por tipo de mídia (áudio ou vídeo), contêiner de saída, resolução quando aplicável e indicação de original.
- **Capacidade analisada da mídia**: características de áudio, vídeo, contêiner e resolução identificadas para a origem e usadas para determinar quais presets podem ser oferecidos.
- **Seleção de download**: preset escolhido pela pessoa e associado ao download correspondente.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% das opções mostradas em testes correspondem a um preset do catálogo padrão e a uma saída que os dados analisados indicam como produzível.
- **SC-002**: Em todos os casos de teste com mídia máxima de 720p, nenhuma opção de vídeo acima de 720p é exibida; todas as resoluções inferiores produzíveis do catálogo são exibidas.
- **SC-003**: 100% dos downloads MP3/áudio MP4 concluídos não contêm trilha de vídeo; 100% dos downloads de vídeo respeitam o contêiner e o limite de resolução selecionados.
- **SC-004**: Pelo menos 90% das pessoas de teste conseguem identificar e selecionar uma opção compatível em até 30 segundos após a análise.
- **SC-005**: 100% das seleções “original” elegíveis preservam o contêiner original e não passam por conversão.

## Assumptions

- O catálogo é uma lista padrão da ferramenta, igual para todas as contas; esta feature não adiciona preferências configuráveis por usuário nem altera retenção ou tema.
- “Áudio MP4” significa arquivo somente de áudio dentro de um contêiner MP4; o codec específico depende do que a origem e as capacidades de produção suportarem.
- “Resolução disponível” depende da análise da origem e da capacidade autorizada de converter a mídia; a ferramenta não deve ampliar os pixels da imagem-fonte. O preset DCI 2K corresponde a um quadro 2048×1080, centraliza a imagem sem distorção e usa barras pretas quando necessário.
- As opções são apresentadas apenas para conteúdo que a pessoa pode acessar e está autorizada a baixar.