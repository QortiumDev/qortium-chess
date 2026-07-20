// Portuguese (pt) translations for Qortium Chess.
//
// Brazilian Portuguese (pt-BR), matching the rest of the Qortium fleet: gerund
// progressives ('Conectando…') rather than the European "a + infinitive" form,
// second person with 'você' rather than the European familiar, and Brazilian
// vocabulary ('aplicativo', 'acessar', 'solicitação', 'desenvolvedores').
import type { EN_STRINGS } from './en';

const MESSAGES: Partial<Record<keyof typeof EN_STRINGS, string>> = {
  'app.title': 'Xadrez',

  'nav.lobby': 'Sala',
  'nav.localBoard': 'Tabuleiro local',
  'nav.developers': 'Desenvolvedores',

  'status.connecting': 'Conectando…',
  'status.playingAs': 'Jogando como {name}',
  'status.spectator': 'Espectador (sem conta)',
  'status.unavailable': 'Sala indisponível — apenas jogo local',
  'status.noNode': 'sem nó',
  'notice.lobbyUnreachable': 'Não foi possível acessar a sala de Xadrez ({reason}). O tabuleiro local continua funcionando.',

  'label.you': 'Você',
  'color.white': 'Brancas',
  'color.black': 'Pretas',
  'color.random': 'Aleatório',

  'game.matchup': '{white} contra {black} — {id}',
  'game.inviteBy': 'Convite de {creator} ({color}) — {id}',
  'game.withPly': '{summary} — meio-lance {count}',
  'game.withResult': '{summary} — {result} ({reason})',

  'lobby.spectatorNotice': 'Modo espectador — abra este aplicativo no Qortium Home com uma conta para jogar.',
  'lobby.joinGroupNotice': 'Entre no grupo da sala de Xadrez para criar convites e jogar.',
  'lobby.joinGroupAction': 'Entrar no grupo da sala',
  'lobby.joinGroupHint': '(a confirmação leva um bloco)',
  'lobby.createInvite': 'Criar convite',
  'lobby.openInviteExists': 'Você já tem um convite aberto ({id}).',
  'lobby.cancelInvite': 'Cancelar',
  'lobby.yourColor': 'Sua cor',
  'lobby.notePlaceholder': 'Nota (opcional)',
  'lobby.postInvite': 'Publicar convite',
  'lobby.openInvites': 'Convites abertos',
  'lobby.noOpenInvites': 'Sem convites abertos. Publique um!',
  'lobby.join': 'Entrar',
  'lobby.joinRequestsWaiting': 'solicitações de entrada aguardando — abra o jogo',
  'lobby.yourGames': 'Seus jogos',
  'lobby.watch': 'Assistir',
  'lobby.noGamesInProgress': 'Nenhum jogo em andamento.',
  'lobby.recentlyFinished': 'Terminados recentemente',

  'game.backToLobby': '← Sala',
  'game.over': 'Jogo terminado: {result} ({reason})',
  'game.aborted': 'Jogo abortado.',
  'game.inviteCanceled': 'Convite cancelado.',
  'game.waitingOpponent': 'Aguardando um adversário…',
  'game.approvePrompt': 'Aprove uma solicitação de entrada para começar o jogo.',
  'game.waitingApproval': 'Aguardando a aprovação do criador…',
  'game.yourMove': 'É a sua vez.',
  'game.joinRequests': 'Solicitações de entrada',
  'game.approve': 'Aprovar',
  'game.reject': 'Rejeitar',
  'game.acceptDraw': 'Aceitar empate',
  'game.declineDraw': 'Recusar empate',
  'game.drawOffered': 'Empate proposto…',
  'game.offerDraw': 'Propor empate',
  'game.resign': 'Desistir',
  'game.abort': 'Abortar',
  'game.chat': 'Chat',
  'game.chatPlaceholder': 'Diga alguma coisa…',
  'game.send': 'Enviar',
  'game.rejectedMessages': 'Mensagens rejeitadas',
  'game.expiryNotice': 'Não salvo — esta partida expira junto com o histórico do chat, a menos que o jogo continue.',

  // -- board accessibility ---------------------------------------------------
  'piece.whiteKing': 'rei branco',
  'piece.whiteQueen': 'dama branca',
  'piece.whiteRook': 'torre branca',
  'piece.whiteBishop': 'bispo branco',
  'piece.whiteKnight': 'cavalo branco',
  'piece.whitePawn': 'peão branco',
  'piece.blackKing': 'rei preto',
  'piece.blackQueen': 'dama preta',
  'piece.blackRook': 'torre preta',
  'piece.blackBishop': 'bispo preto',
  'piece.blackKnight': 'cavalo preto',
  'piece.blackPawn': 'peão preto',

  'square.empty': '{square}, vazia',
  'square.occupied': '{square}, {piece}',
  'square.selected': '{name}, selecionada',
  'square.legalMove': '{name}, lance legal',
  'square.capture': '{name}, capturável',
  'square.lastMove': '{name}, último lance',
  'square.inCheck': '{name}, em xeque',

  'board.label': 'Tabuleiro de xadrez',
  'board.announcements': 'Anúncios de lances',
  'board.keyboardHelp':
    'Use as setas para percorrer o tabuleiro, Enter ou Espaço para selecionar uma peça e depois a casa de destino, e Escape para cancelar a seleção.',
  'board.turnWhite': 'Vez das brancas',
  'board.turnBlack': 'Vez das pretas',
  'board.checkSuffix': '{status} — xeque!',

  'announce.move': '{piece} de {from} para {to}',
  'announce.capture': '{piece} de {from} captura em {to}',
  'announce.castleKingside': '{color} faz roque pequeno',
  'announce.castleQueenside': '{color} faz roque grande',
  'announce.promotion': '{move}, promove a {piece}',
  'announce.check': '{move}, xeque',
  'announce.checkmate': '{move}, xeque-mate',
  'announce.illegalTarget': '{square} não é um destino legal.',

  'local.newGame': 'Novo jogo',
  'local.undo': 'Desfazer jogada',

  'terminal.checkmate': 'xeque-mate',
  'terminal.stalemate': 'afogamento',
  'terminal.insufficientMaterial': 'material insuficiente',
  'terminal.fiftyMove': 'regra dos 50 lances',
  'terminal.threefoldRepetition': 'tripla repetição',
  'terminal.drawAgreed': 'empate acordado',
  'terminal.resign': 'desistência',
  'terminal.abort': 'abortado',
};

export default MESSAGES;
