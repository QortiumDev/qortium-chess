// English is the source catalog: every other locale is type-checked against it
// via `MessageKey = keyof typeof EN_STRINGS`, and the parity suite fails any
// locale that adds, drops, or leaves a key untranslated.
//
// Protocol identifiers are deliberately NOT in here. Validation badges
// (`invalid.illegalMove`), wire message types (`move`, `drawOffer`) and result
// scores (`1-0`, `1/2-1/2`) are stable machine-readable tokens shown verbatim so
// they can be matched against the QCH1 spec, which is English by definition.

export const EN_STRINGS = {
  'app.title': 'Chess',

  'nav.lobby': 'Lobby',
  'nav.localBoard': 'Local board',
  'nav.developers': 'Developers',

  'status.connecting': 'Connecting…',
  'status.playingAs': 'Playing as {name}',
  'status.spectator': 'Spectator (no account)',
  'status.unavailable': 'Lobby unavailable — local play only',
  'status.noNode': 'no node',
  'notice.lobbyUnreachable': 'Could not reach the Chess lobby ({reason}). The local board still works.',

  'label.you': 'You',
  'color.white': 'White',
  'color.black': 'Black',
  'color.random': 'Random',

  'game.matchup': '{white} vs {black} — {id}',
  'game.inviteBy': "{creator}'s invite ({color}) — {id}",
  'game.withPly': '{summary} — ply {count}',
  'game.withResult': '{summary} — {result} ({reason})',

  'lobby.spectatorNotice': 'Spectator mode — open this app inside Qortium Home with an account to play.',
  'lobby.joinGroupNotice': 'Join the Chess lobby group to create invites and play.',
  'lobby.joinGroupAction': 'Join lobby group',
  'lobby.joinGroupHint': '(takes a block to confirm)',
  'lobby.createInvite': 'Create invite',
  'lobby.openInviteExists': 'You already have an open invite ({id}).',
  'lobby.cancelInvite': 'Cancel it',
  'lobby.yourColor': 'Your color',
  'lobby.notePlaceholder': 'Note (optional)',
  'lobby.postInvite': 'Post invite',
  'lobby.openInvites': 'Open invites',
  'lobby.noOpenInvites': 'No open invites. Post one!',
  'lobby.join': 'Join',
  'lobby.joinRequestsWaiting': 'join requests waiting — open the game',
  'lobby.yourGames': 'Your games',
  'lobby.watch': 'Watch',
  'lobby.noGamesInProgress': 'No games in progress.',
  'lobby.recentlyFinished': 'Recently finished',

  'game.backToLobby': '← Lobby',
  'game.over': 'Game over: {result} ({reason})',
  'game.aborted': 'Game aborted.',
  'game.inviteCanceled': 'Invite canceled.',
  'game.waitingOpponent': 'Waiting for an opponent to join…',
  'game.approvePrompt': 'Approve a join request to start the game.',
  'game.waitingApproval': 'Waiting for the creator to approve a joiner…',
  'game.yourMove': 'Your move.',
  'game.joinRequests': 'Join requests',
  'game.approve': 'Approve',
  'game.reject': 'Reject',
  'game.acceptDraw': 'Accept draw',
  'game.declineDraw': 'Decline draw',
  'game.drawOffered': 'Draw offered…',
  'game.offerDraw': 'Offer draw',
  'game.resign': 'Resign',
  'game.abort': 'Abort',
  'game.chat': 'Chat',
  'game.chatPlaceholder': 'Say something…',
  'game.send': 'Send',
  'game.rejectedMessages': 'Rejected messages',

  // -- board accessibility ---------------------------------------------------
  // Piece names are twelve explicit keys, not a "{color} {piece}" template:
  // adjective order and gender agreement differ across the catalog
  // (fr "cavalier blanc", de "weißer Springer", ru "белый конь").
  'piece.whiteKing': 'white king',
  'piece.whiteQueen': 'white queen',
  'piece.whiteRook': 'white rook',
  'piece.whiteBishop': 'white bishop',
  'piece.whiteKnight': 'white knight',
  'piece.whitePawn': 'white pawn',
  'piece.blackKing': 'black king',
  'piece.blackQueen': 'black queen',
  'piece.blackRook': 'black rook',
  'piece.blackBishop': 'black bishop',
  'piece.blackKnight': 'black knight',
  'piece.blackPawn': 'black pawn',

  // Square names are composed by WRAPPING, never by joining words with a
  // hard-coded ", ": each locale owns its own separator and word order.
  // {square} is algebraic coordinate notation ("e4"), which is international.
  'square.empty': '{square}, empty',
  'square.occupied': '{square}, {piece}',
  'square.selected': '{name}, selected',
  'square.legalMove': '{name}, legal move',
  'square.capture': '{name}, capturable',
  'square.lastMove': '{name}, last move',
  'square.inCheck': '{name}, in check',

  'board.label': 'Chess board',
  'board.announcements': 'Move announcements',
  'board.keyboardHelp':
    'Use the arrow keys to move around the board, Enter or Space to select a piece and then its destination, and Escape to cancel the selection.',
  'board.turnWhite': 'White to move',
  'board.turnBlack': 'Black to move',
  'board.checkSuffix': '{status} — check!',

  'announce.move': '{piece} {from} to {to}',
  'announce.capture': '{piece} {from} takes {to}',
  'announce.castleKingside': '{color} castles kingside',
  'announce.castleQueenside': '{color} castles queenside',
  'announce.promotion': '{move}, promoting to {piece}',
  'announce.check': '{move}, check',
  'announce.checkmate': '{move}, checkmate',
  'announce.illegalTarget': '{square} is not a legal destination.',

  'local.newGame': 'New game',
  'local.undo': 'Undo',

  'terminal.checkmate': 'checkmate',
  'terminal.stalemate': 'stalemate',
  'terminal.insufficientMaterial': 'insufficient material',
  'terminal.fiftyMove': 'fifty-move rule',
  'terminal.threefoldRepetition': 'threefold repetition',
  'terminal.drawAgreed': 'draw agreed',
  'terminal.resign': 'resignation',
  'terminal.abort': 'aborted',
} as const;

export default EN_STRINGS;
