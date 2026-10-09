import { PasswordHasher } from "../../password-hasher";

class FakePasswordHasher implements PasswordHasher {
  readonly hashInputs: string[] = [];
  readonly verifyInputs: { passwordHash: string; password: string }[] = [];

  hash(password: string): Promise<string> {
    this.hashInputs.push(password);
    return Promise.resolve(`test-hash:${password}`);
  }

  verify(passwordHash: string, password: string): Promise<boolean> {
    this.verifyInputs.push({ passwordHash, password });
    return Promise.resolve(passwordHash === `test-hash:${password}`);
  }
}

export { FakePasswordHasher };