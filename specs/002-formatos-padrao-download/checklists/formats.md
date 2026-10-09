# Media Format Requirements Checklist: Opções Padrão de Formato para Download

**Purpose**: Revisar completude, clareza, consistência e cobertura dos requisitos do catálogo de formatos e conversões de mídia.
**Created**: 2026-10-09
**Feature**: [spec.md](../spec.md)

**Note**: Esta checklist avalia a qualidade dos requisitos, não a implementação.
**Review Ownership**: Esta checklist pertence ao revisor. Marque `[x]` somente quando o critério de qualidade do requisito tiver sido revisado e aprovado.
**Marker Semantics**: `[x]` significa aprovação da qualidade dos requisitos, não conclusão da implementação.

## Requirement Completeness

- [ ] CHK001 - O catálogo padrão especifica todas as opções de áudio, contêineres de vídeo, resoluções e condições para oferecer o original? [Completeness, Spec §FR-002, FR-007]
- [ ] CHK002 - Os requisitos definem quando cada saída de áudio é produzível, incluindo a distinção entre MP3, áudio em contêiner MP4 e ausência de trilha de vídeo? [Completeness, Spec §FR-002, FR-003]

## Requirement Clarity

- [ ] CHK003 - O critério de disponibilidade de cada resolução está definido sem ambiguidade para fontes com dimensões ou proporções diferentes? [Clarity, Spec §FR-004, FR-005, FR-006]
- [ ] CHK004 - “Formato original” está definido de modo inequívoco quando a origem oferece várias faixas, contêineres ou combinações de áudio e vídeo? [Ambiguity, Spec §FR-007]

## Requirement Consistency

- [ ] CHK005 - As regras de não ampliar a imagem-fonte, emitir quadro DCI 2048×1080 e adicionar barras pretas são consistentes entre spec e plano, especialmente para uma origem 1920×1080? [Conflict, Spec §FR-004, FR-006; Plan §Design Decisions]
- [ ] CHK006 - Os requisitos deixam claro se vídeos MP4 devem preservar o áudio da origem e qual é o resultado quando a origem não tem áudio? [Gap, Spec §FR-002, FR-003; Acceptance Scenario 1]

## Acceptance Criteria Quality

- [ ] CHK007 - Os critérios mensuráveis distinguem resolução da imagem-fonte e dimensão do quadro de saída quando há padding DCI? [Measurability, Spec §SC-002, SC-003]
- [ ] CHK008 - O critério de sucesso de 90% em até 30 segundos identifica o público avaliado e as condições de medição? [Measurability, Spec §SC-004]

## Scenario and Edge Case Coverage

- [ ] CHK009 - O comportamento está especificado quando a análise não consegue classificar áudio/vídeo ou encontra faixas separadas? [Coverage, Edge Case; Spec §FR-003, FR-010]
- [ ] CHK010 - Os requisitos distinguem indisponibilidade detectada na análise, seleção obsoleta e falha de conversão após a seleção? [Coverage, Exception Flow; Spec §FR-008, FR-010]

## Dependencies and Non-Functional Requirements

- [ ] CHK011 - Os requisitos definem ou explicitamente herdam limites de duração para análise e conversão de mídia? [Gap, Spec §Success Criteria; Plan §Technical Context]
- [ ] CHK012 - A dependência de encoders disponíveis para MP3 e áudio MP4 está ligada a critérios claros para oferecer ou omitir esses presets? [Dependency, Spec §FR-002, FR-003; Plan §Technical Context]

## Cross-Artifact Requirements

- [ ] CHK013 - O contrato define como o preset selecionado é representado também no registro de download/histórico, além da resposta de análise? [Completeness, Spec §FR-009; Contract §/downloads]
- [ ] CHK014 - O plano e os critérios de conclusão refletem a exigência constitucional de testes unitários backend próximos de 100% e justificativa para lacunas? [Consistency, Constitution §VIII; Plan §Constitution Check; Gap]
- [ ] CHK015 - A persistência especifica defaults ou backfill para novos campos em downloads existentes, sem deixar o processamento de registros legados ambíguo? [Dependency, Plan §Storage; Data Model §Download Selection; Gap]

## Recovery and Acceptance Coverage

- [ ] CHK016 - Os critérios de aceitação cobrem o resultado definido para falha de conversão, incluindo que nenhum arquivo parcial fique disponível? [Coverage, Exception Flow; Spec §Edge Cases, FR-010]

## Notes

- Marque itens `[x]` somente após a revisão de qualidade dos requisitos; mantenha itens pendentes desmarcados.
- `/speckit-implement` lê o estado da checklist como gate e não deve alterar seus marcadores.
- Os itens avaliam a redação da spec/plano, não o comportamento do código.
- IDs são sequenciais e podem ser referenciados em comentários de revisão.
