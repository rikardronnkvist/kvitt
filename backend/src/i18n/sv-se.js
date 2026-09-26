export const notifications = {
  groupMemberJoined: (memberName) => `${memberName} gick med i gruppen`,
};

export const oauthMessages = {
  accessDenied: 'Du nekade appen åtkomst.',
  authorizationRateLimited: 'För många auktoriseringsförsök. Försök igen senare.',
  grantMutationRateLimited: 'För många ändringar av anslutna appar. Försök igen senare.',
  grantReadRateLimited: 'För många förfrågningar om anslutna appar. Försök igen senare.',
  grantNotFound: 'Den anslutna appen hittades inte.',
  invalidAccessToken: 'Ogiltig eller utgången OAuth-token.',
  invalidAuthorizationCode: 'Auktoriseringskoden är ogiltig eller har gått ut.',
  invalidClient: 'OAuth-klienten kunde inte verifieras.',
  invalidClientAuthentication: 'Klientautentiseringen misslyckades.',
  invalidClientMetadata: 'Klientens registreringsuppgifter är ogiltiga.',
  invalidPkce: 'Kodverifieringen misslyckades.',
  invalidRefreshToken: 'Uppdateringstoken är ogiltig eller har gått ut.',
  invalidRedirectUri: 'Klientens omdirigeringsadress är inte registrerad.',
  invalidRequest: 'OAuth-förfrågan är ogiltig.',
  invalidScope: 'Ett eller flera begärda behörighetsområden är ogiltiga.',
  invalidTarget: 'Den begärda resursen är ogiltig.',
  missingScope: 'Din OAuth-token saknar behörighet för den här åtgärden.',
  metadataRateLimited: 'För många förfrågningar om OAuth-konfiguration. Försök igen senare.',
  registrationRateLimited: 'För många klientregistreringar. Försök igen senare.',
  tokenRateLimited: 'För många tokenförfrågningar. Försök igen senare.',
  unsupportedGrantType: 'Den begärda typen av tokenutfärdande stöds inte.',
  unsupportedResponseType: 'Endast auktoriseringskod stöds.',
};
