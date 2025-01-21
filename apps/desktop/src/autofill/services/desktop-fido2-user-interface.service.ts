import { firstValueFrom, lastValueFrom, map, Subject } from "rxjs";

import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { AuthService } from "@bitwarden/common/auth/abstractions/auth.service";
import { AuthenticationStatus } from "@bitwarden/common/auth/enums/authentication-status";
import {
  Fido2UserInterfaceService as Fido2UserInterfaceServiceAbstraction,
  Fido2UserInterfaceSession,
  NewCredentialParams,
  PickCredentialParams,
} from "@bitwarden/common/platform/abstractions/fido2/fido2-user-interface.service.abstraction";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { MessagingService } from "@bitwarden/common/platform/abstractions/messaging.service";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import { CipherRepromptType, CipherType, SecureNoteType } from "@bitwarden/common/vault/enums";
import { Cipher } from "@bitwarden/common/vault/models/domain/cipher";
import { CardView } from "@bitwarden/common/vault/models/view/card.view";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";
import { IdentityView } from "@bitwarden/common/vault/models/view/identity.view";
import { LoginUriView } from "@bitwarden/common/vault/models/view/login-uri.view";
import { LoginView } from "@bitwarden/common/vault/models/view/login.view";
import { SecureNoteView } from "@bitwarden/common/vault/models/view/secure-note.view";

export class DesktopFido2UserInterfaceService
  implements Fido2UserInterfaceServiceAbstraction<void>
{
  constructor(
    private authService: AuthService,
    private cipherService: CipherService,
    private accountService: AccountService,
    private logService: LogService,
    private messagingService: MessagingService,
  ) {}

  async newSession(
    fallbackSupported: boolean,
    _tab: void,
    abortController?: AbortController,
  ): Promise<DesktopFido2UserInterfaceSession> {
    this.logService.warning("newSession", fallbackSupported, abortController);
    return new DesktopFido2UserInterfaceSession(
      this.authService,
      this.cipherService,
      this.accountService,
      this.logService,
      this.messagingService,
    );
  }
}

export class DesktopFido2UserInterfaceSession implements Fido2UserInterfaceSession {
  constructor(
    private authService: AuthService,
    private cipherService: CipherService,
    private accountService: AccountService,
    private logService: LogService,
    private messagingService: MessagingService,
  ) {}

  private operationSubject = new Subject<void>();
  private createdCipher: Cipher;

  /**
   * Notifies the Fido2UserInterfaceSession that the UI operations has completed and it can return to the OS.
   */
  notifyOperationCompleted() {
    this.operationSubject.next();
    this.operationSubject.complete();
  }

  /**
   * Returns once the UI has confirmed and completed the operation
   * @returns
   */
  private async waitForUICompletion(): Promise<void> {
    return lastValueFrom(this.operationSubject);
  }

  /**
   * This is called by the OS. It loads the UI and waits for the user to confirm the new credential. Once the UI has confirmed, it returns to the the OS.
   * @param param0
   * @returns
   */
  async confirmNewCredential({
    credentialName,
    userName,
    userVerification,
    rpId,
  }: NewCredentialParams): Promise<{ cipherId: string; userVerified: boolean }> {
    this.logService.warning(
      "confirmNewCredential",
      credentialName,
      userName,
      userVerification,
      rpId,
    );

    // Load the UI (to be refactored)
    this.messagingService.send("loadurl", { url: "/passkeys", modal: true });

    // Wait for the UI to wrap up
    await this.waitForUICompletion();

    // Return the new cipher (this.createdCipher)
    return { cipherId: this.createdCipher.id, userVerified: userVerification };
  }

  /**
   * Can be called by the UI to create a new credential with user input etc.
   * @param param0
   */
  async createCredential({ credentialName, userName, rpId }: NewCredentialParams): Promise<void> {
    // Store the passkey on a new cipher to avoid replacing something important
    const cipher = new CipherView();
    cipher.name = credentialName;

    cipher.type = CipherType.Login;
    cipher.login = new LoginView();
    cipher.login.username = userName;
    cipher.login.uris = [new LoginUriView()];
    cipher.login.uris[0].uri = "https://" + rpId;
    cipher.card = new CardView();
    cipher.identity = new IdentityView();
    cipher.secureNote = new SecureNoteView();
    cipher.secureNote.type = SecureNoteType.Generic;
    cipher.reprompt = CipherRepromptType.None;

    const activeUserId = await firstValueFrom(
      this.accountService.activeAccount$.pipe(map((a) => a?.id)),
    );

    const encCipher = await this.cipherService.encrypt(cipher, activeUserId);
    const createdCipher = await this.cipherService.createWithServer(encCipher);

    this.createdCipher = createdCipher;
  }

  async pickCredential({
    cipherIds,
    userVerification,
  }: PickCredentialParams): Promise<{ cipherId: string; userVerified: boolean }> {
    this.logService.warning("pickCredential", cipherIds, userVerification);

    return { cipherId: cipherIds[0], userVerified: userVerification };
  }

  async informExcludedCredential(existingCipherIds: string[]): Promise<void> {
    this.logService.warning("informExcludedCredential", existingCipherIds);
  }

  async ensureUnlockedVault(): Promise<void> {
    this.logService.warning("ensureUnlockedVault");

    const status = await firstValueFrom(this.authService.activeAccountStatus$);
    if (status !== AuthenticationStatus.Unlocked) {
      throw new Error("Vault is not unlocked");
    }
  }

  async informCredentialNotFound(): Promise<void> {
    this.logService.warning("informCredentialNotFound");
  }

  async close() {
    this.logService.warning("close");
  }
}
