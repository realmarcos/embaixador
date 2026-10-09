interface SessionTokenSigner {
  sign(userId: string): Promise<string>;
}

export { SessionTokenSigner };