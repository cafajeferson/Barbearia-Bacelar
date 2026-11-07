# Paridade com o app original

Levantamento das telas do admin do sistema original (`barbearia-bacelar.ayworking.site`), feito em 2026-11-07 navegando logado como admin e lendo botões, abas, colunas e textos de cada tela. Só funções e nomes de tela — nenhum código ou arquivo do original foi copiado.

Fora de escopo por decisão do cliente: integração com WhatsApp (Evolution API). Todo o resto deve existir no nosso app.

**Regra:** só acrescentar o que falta. Melhorias que o nosso já tem além do original (principalmente na agenda) ficam como estão; nada é removido ou trocado para ficar idêntico.

Legenda: ✅ temos · 🟡 temos em parte · ❌ falta

## Gerais

| Item | Original | Nosso |
|---|---|---|
| Cadastro de cliente pelo próprio app (`/cadastro`) | sim | ❌ só Google ou conta criada pelo admin |
| Recuperar senha (`/recovery`) | sim | ❌ |
| Notificação push no celular (Firebase: `/api/fcm-token`, `/api/broadcast`) | sim | ❌ só sino dentro do app |
| Contadores no menu (Em aberto, Pendências) | sim | ❌ |
| Botão "Atualizar" em cada tela | sim | 🟡 em algumas |
| Tabelas: densidade, escolher colunas, resetar, paginação, ordenar coluna | sim | ❌ |
| Menu lateral recolhível | sim | ❌ (temos gaveta no celular) |

## Dashboard

| Item | Nosso |
|---|---|
| Cards Receita / Agendamentos / Pendentes / Faltas com explicação "Sobre" | 🟡 sem o "Sobre" |
| Banner "Atendimentos em aberto" com "Fechar agora" | 🟡 conferir botão |
| Painel: comissões a pagar, assinaturas em dia (por mês), assinaturas registradas | 🟡 temos ativas e soma; falta "registradas" |
| Próximos, Ranking, Serviços populares, Atividade recente | ✅ |

## Agenda Mestre

| Item | Nosso |
|---|---|
| Dia / Mês, bloquear, novo agendamento, filtro por profissional | ✅ |
| Painel do agendamento: iniciar, concluir, no-show, cancelar | ✅ |
| Painel: **Editar** e **Reduzir tempo** | ❌ (hoje só arrastando) |

## Recorrências

| Item | Nosso |
|---|---|
| Grupos Pendentes / Em atenção / Saudáveis | 🟡 conferir "Saudáveis" |
| Aceitar pedido / Recusar / Mais ações | 🟡 conferir |

## Clientes, Equipe, Produtos

| Item | Nosso |
|---|---|
| Busca, filtros (Assinantes, Com no-shows, Bloqueados), novo/editar | ✅ |
| Paginação e ferramentas de tabela | ❌ |
| Equipe: menu "Ações" por profissional, coluna Unidades | 🟡 |

## Catálogo

| Item | Nosso |
|---|---|
| Seções, novo serviço, destacar | ✅ |
| Arrastar para reordenar seções e serviços | ❌ |
| Recolher / expandir seção, ligar/desligar seção | ❌ |

## Fechamento do mês

| Item | Nosso |
|---|---|
| Checklist, totais, tabela por barbeiro, CSV, PDF | ✅ |
| "Pago fora do app" por barbeiro e em lote | ✅ (nome: "Marcar como pago") |
| **Fechar mês** (travar) | ❌ |
| Lista "Assinaturas ativas sem pagamento registrado" com **Confirmar período** | ❌ |
| "Conferência com o painel" (receita, produtos, comissões, assinaturas conferem) | ❌ |
| Base da comissão de assinatura "gravada" (congelada no fechamento) | ❌ |

## Comissões

| Item | Nosso |
|---|---|
| Abas Serviços & Produtos / Assinaturas, por profissional, Configurar | ✅ |

## Assinaturas

| Item | Nosso |
|---|---|
| Busca, filtro de status, aprovar/rejeitar, registrar pagamento, vence em, usos restantes | ✅ |
| Seleção múltipla e aprovar/rejeitar em lote | ❌ |

## Promoções e Cupons

| Item | Nosso |
|---|---|
| Promoções: nova, editar, excluir, ligar/desligar | 🟡 conferir editar |
| Cupons: copiar código, editar, **histórico de uso**, excluir, ligar/desligar | 🟡 falta histórico e copiar |

## Em aberto

| Item | Nosso |
|---|---|
| Lista agrupada por dia com Concluir / Não compareceu | ✅ |
| Aba **Fechados pelo sistema** | ❌ |
| **Encerrar até <mês>** em lote | ❌ |
| Fechamento automático depois de N dias (selo "Fechado pelo sistema") | ❌ |

## Pendências

| Item | Nosso |
|---|---|
| Tela inteira: horários em unidade desativada, profissional fora da equipe, horário dentro de folga, com "Decidir" | ❌ |

## Configurações

| Item | Nosso |
|---|---|
| **Unidades**: endereço, telefone, ativa/inativa | ✅ |
| Unidades: **horário de funcionamento** | ❌ |
| **Regras**: faltas (limite, contar últimos N meses, ação "só agenda falando com a barbearia"), antecedência mín./máx., **prazo para aprovar horário fixo**, **fechamento automático**, comissões padrão (agendado, sem hora marcada, produtos), tolerância de assinatura, **histórico de alterações** | 🟡 faltam os itens em negrito |
| **Identidade Visual**: logotipo (upload, modo inicial/imagem, cor de fundo), nome, nome curto, tagline | ❌ |
| **Permissões**: contagem por perfil, lista de usuários com perfis (um usuário pode ser admin + profissional + cliente), gerenciar | ❌ |
| **API Keys**: criar, rotacionar e revogar chaves da API pública | ❌ |

## Ainda não levantado

- **App do cliente** e **Minha Agenda do profissional** no original: o login de admin não mostra essas telas. Precisa de um login de cliente e de profissional no original, ou de prints.
- Formulários por dentro (campos de "Novo agendamento", "Novo cliente", "Adicionar profissional", "Novo serviço" etc.).
