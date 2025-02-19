//
//  CredentialProviderViewController.swift
//  autofill-extension
//
//  Created by Andreas Coroiu on 2023-12-21.
//

import AuthenticationServices
import os

class CredentialProviderViewController: ASCredentialProviderViewController {
    let logger: Logger
    
    // There is something a bit strange about the initialization/deinitialization in this class.
    // Sometimes deinit won't be called after a request has successfully finished,
    // which would leave this class hanging in memory and the IPC connection open.
    //
    // If instead I make this a static, the deinit gets called correctly after each request.
    // I think we still might want a static regardless, to be able to reuse the connection if possible.
    let client: MacOsProviderClient = {
        let logger = Logger(subsystem: "com.bitwarden.desktop.autofill-extension", category: "credential-provider")
        
        // Check if the Electron app is running
        let workspace = NSWorkspace.shared
        let isRunning = workspace.runningApplications.contains { app in
            app.bundleIdentifier == "com.bitwarden.desktop"
        }
        
        
         if !isRunning {
            logger.log("[autofill-extension] Bitwarden Desktop not running, attempting to launch")
            
            // Try to launch the app
            if let appURL = workspace.urlForApplication(withBundleIdentifier: "com.bitwarden.desktop") {
                let semaphore = DispatchSemaphore(value: 0)
                
                workspace.openApplication(at: appURL,
                                       configuration: NSWorkspace.OpenConfiguration()) { app, error in
                    if let error = error {
                        logger.error("[autofill-extension] Failed to launch Bitwarden Desktop: \(error.localizedDescription)")
                    } else if let app = app {
                        logger.log("[autofill-extension] Successfully launched Bitwarden Desktop")
                    } else {
                        logger.error("[autofill-extension] Failed to launch Bitwarden Desktop: unknown error")
                    }
                    semaphore.signal()
                }
                
                // Wait for launch completion with timeout
                _ = semaphore.wait(timeout: .now() + 5.0)
                
                // Add a small delay to allow for initialization
                Thread.sleep(forTimeInterval: 1.0)
            } else {
                logger.error("[autofill-extension] Could not find Bitwarden Desktop app")
            }
        } else {
            logger.log("[autofill-extension] Bitwarden Desktop is running")    
        }
        
        logger.log("[autofill-extension] Connecting to Bitwarden over IPC")    

        return MacOsProviderClient.connect()
    }()
    
    init() {
        logger = Logger(subsystem: "com.bitwarden.desktop.autofill-extension", category: "credential-provider")
        
        logger.log("[autofill-extension] initializing extension")
        
        super.init(nibName: nil, bundle: nil)
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    deinit {
        logger.log("[autofill-extension] deinitializing extension")
        self.extensionContext.cancelRequest(withError: NSError(domain: ASExtensionErrorDomain, code: ASExtensionError.userCanceled.rawValue))
    }
    
    
    @IBAction func cancel(_ sender: AnyObject?) {
        self.extensionContext.cancelRequest(withError: NSError(domain: ASExtensionErrorDomain, code: ASExtensionError.userCanceled.rawValue))
    }
    
    @IBAction func passwordSelected(_ sender: AnyObject?) {
        let passwordCredential = ASPasswordCredential(user: "j_appleseed", password: "apple1234")
        self.extensionContext.completeRequest(withSelectedCredential: passwordCredential, completionHandler: nil)
    }
    
    private func getWindowPosition() -> [Int32] {
        let frame = self.view.window?.frame ?? .zero
        let screenHeight = NSScreen.main?.frame.height ?? 0
        
        logger.log("[autofill-extension] Detailed window debug:")
        logger.log("  Popup frame:")
        logger.log("    origin.x: \(frame.origin.x)")
        logger.log("    origin.y: \(frame.origin.y)")
        logger.log("    width: \(frame.width)")
        logger.log("    height: \(frame.height)")
       
        
        // frame.width and frame.height is always 0. Estimating works OK for now.
        let estimatedWidth:CGFloat = 400;
        let estimatedHeight:CGFloat = 200;
        let centerX = Int32(round(frame.origin.x + estimatedWidth/2))
        let centerY = Int32(round(screenHeight - (frame.origin.y + estimatedHeight/2)))
        
        logger.log("  Calculated center:")
        logger.log("    x: \(centerX)")
        logger.log("    y: \(centerY)")
        
        return [centerX, centerY]
    }
    
    override func loadView() {
        let view = NSView()
        view.isHidden = true
        //view.backgroundColor = .clear
        self.view = view
    }
    
    /*
     Implement this method if your extension supports showing credentials in the QuickType bar.
     When the user selects a credential from your app, this method will be called with the
     ASPasswordCredentialIdentity your app has previously saved to the ASCredentialIdentityStore.
     Provide the password by completing the extension request with the associated ASPasswordCredential.
     If using the credential would require showing custom UI for authenticating the user, cancel
     the request with error code ASExtensionError.userInteractionRequired.
     
     */
    
    // Deprecated
    override func provideCredentialWithoutUserInteraction(for credentialIdentity: ASPasswordCredentialIdentity) {
        logger.log("[autofill-extension] provideCredentialWithoutUserInteraction called \(credentialIdentity)")
        logger.log("[autofill-extension]     user \(credentialIdentity.user)")
        logger.log("[autofill-extension]     id \(credentialIdentity.recordIdentifier ?? "")")
        logger.log("[autofill-extension]     sid \(credentialIdentity.serviceIdentifier.identifier)")
        logger.log("[autofill-extension]     sidt \(credentialIdentity.serviceIdentifier.type.rawValue)")
        
        //        let databaseIsUnlocked = true
        //        if (databaseIsUnlocked) {
        let passwordCredential = ASPasswordCredential(user: credentialIdentity.user, password: "example1234")
        self.extensionContext.completeRequest(withSelectedCredential: passwordCredential, completionHandler: nil)
        //        } else {
        //            self.extensionContext.cancelRequest(withError: NSError(domain: ASExtensionErrorDomain, code:ASExtensionError.userInteractionRequired.rawValue))
        //        }
    }
    
    override func provideCredentialWithoutUserInteraction(for credentialRequest: any ASCredentialRequest) {
        
        //logger.log("[autofill-extension] provideCredentialWithoutUserInteraction2(credentialRequest) called \(request)")
        
        if let request = credentialRequest as? ASPasskeyCredentialRequest {
            if let passkeyIdentity = request.credentialIdentity as? ASPasskeyCredentialIdentity {
                
                logger.log("[autofill-extension] provideCredentialWithoutUserInteraction2(passkey) called \(request)")
                
                class CallbackImpl: PreparePasskeyAssertionCallback {
                    let ctx: ASCredentialProviderExtensionContext
                    let logger: Logger
                    required init(_ ctx: ASCredentialProviderExtensionContext,_ logger: Logger) {
                        self.ctx = ctx
                        self.logger = logger
                    }
                    
                    func onComplete(credential: PasskeyAssertionResponse) {
                        ctx.completeAssertionRequest(using: ASPasskeyAssertionCredential(
                            userHandle: credential.userHandle,
                            relyingParty: credential.rpId,
                            signature: credential.signature,
                            clientDataHash: credential.clientDataHash,
                            authenticatorData: credential.authenticatorData,
                            credentialID: credential.credentialId
                        ))
                    }
                    
                    func onError(error: BitwardenError) {
                        logger.log("[autofill-extension] ERROR HAPPENED in swift error \(error)")
                        ctx.cancelRequest(withError: error)
                    }
                }
                
                let userVerification = switch request.userVerificationPreference {
                case .preferred:
                    UserVerification.preferred
                case .required:
                    UserVerification.required
                default:
                    UserVerification.discouraged
                }
                
                let req = PasskeyAssertionWithoutUserInterfaceRequest(
                    rpId: passkeyIdentity.relyingPartyIdentifier,
                    credentialId: passkeyIdentity.credentialID,
                    userName: passkeyIdentity.userName,
                    userHandle: passkeyIdentity.userHandle,
                    recordIdentifier: passkeyIdentity.recordIdentifier,
                    clientDataHash: request.clientDataHash,
                    userVerification: userVerification,
                    windowXy: self.getWindowPosition()
                )
                
                self.client.preparePasskeyAssertionWithoutUserInterface(request: req, callback: CallbackImpl(self.extensionContext, self.logger))
                return
            }
        }
        
        if let request = credentialRequest as? ASPasswordCredentialRequest {
            logger.log("[autofill-extension] provideCredentialWithoutUserInteraction2(password) called \(request)")
            return;
        }
        
        logger.log("[autofill-extension] provideCredentialWithoutUserInteraction2 called wrong")
        self.extensionContext.cancelRequest(withError: BitwardenError.Internal("Invalid authentication request"))
    }
    
    /*
     Implement this method if provideCredentialWithoutUserInteraction(for:) can fail with
     ASExtensionError.userInteractionRequired. In this case, the system may present your extension's
     UI and call this method. Show appropriate UI for authenticating the user then provide the password
     by completing the extension request with the associated ASPasswordCredential.
     
     override func prepareInterfaceToProvideCredential(for credentialIdentity: ASPasswordCredentialIdentity) {
     }
     */
    
    
    override func prepareInterfaceForExtensionConfiguration() {
        logger.log("[autofill-extension] prepareInterfaceForExtensionConfiguration called")
    }
    
    override func prepareInterface(forPasskeyRegistration registrationRequest: ASCredentialRequest) {
        logger.log("[autofill-extension] prepareInterface")
        
        // Create a timer for 90 second timeout
        let timeoutTimer = DispatchWorkItem { [weak self] in
            guard let self = self else { return }
            logger.log("[autofill-extension] Registration timed out after 90 seconds")
            self.extensionContext.cancelRequest(withError: BitwardenError.Internal("Registration timed out"))
        }
        
        // Schedule the timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + 90, execute: timeoutTimer)
        
        // // Create a timer to show UI after 10 seconds
        // DispatchQueue.main.asyncAfter(deadline: .now() + 90) { [weak self] in
        //     guard let self = self else { return }
        //     // Configure and show UI elements for manual cancellation
        //     self.configureTimeoutUI()
        // }
        
        if let request = registrationRequest as? ASPasskeyCredentialRequest {
            if let passkeyIdentity = registrationRequest.credentialIdentity as? ASPasskeyCredentialIdentity {
                logger.log("[autofill-extension] prepareInterface(passkey) called \(request)")
                
                class CallbackImpl: PreparePasskeyRegistrationCallback {
                    let ctx: ASCredentialProviderExtensionContext
                    
                    required init(_ ctx: ASCredentialProviderExtensionContext) {
                        self.ctx = ctx
                    }
                    
                    func onComplete(credential: PasskeyRegistrationResponse) {
                        
                        
                        ctx.completeRegistrationRequest(using: ASPasskeyRegistrationCredential(
                            relyingParty: credential.rpId,
                            clientDataHash: credential.clientDataHash,
                            credentialID: credential.credentialId,
                            attestationObject: credential.attestationObject
                        ))
                    }
                    
                    func onError(error: BitwardenError) {
                        ctx.cancelRequest(withError: error)
                    }
                }
                
                let userVerification = switch request.userVerificationPreference {
                case .preferred:
                    UserVerification.preferred
                case .required:
                    UserVerification.required
                default:
                    UserVerification.discouraged
                }
                
                let req = PasskeyRegistrationRequest(
                    rpId: passkeyIdentity.relyingPartyIdentifier,
                    userName: passkeyIdentity.userName,
                    userHandle: passkeyIdentity.userHandle,
                    clientDataHash: request.clientDataHash,
                    userVerification: userVerification,
                    supportedAlgorithms: request.supportedAlgorithms.map{ Int32($0.rawValue) },
                    windowXy: self.getWindowPosition()
                    
                )
                logger.log("[autofill-extension] prepareInterface(passkey) calling preparePasskeyRegistration")
                // Log details of the request
                logger.log("[autofill-extension]     rpId: \(req.rpId)")
                logger.log("[autofill-extension]     rpId: \(req.userName)")
                
                
                self.client.preparePasskeyRegistration(request: req, callback: CallbackImpl(self.extensionContext))
                return
            }
        }
        
        logger.log("[autofill-extension] We didn't get a passkey")
        
        timeoutTimer.cancel()
        // If we didn't get a passkey, return an error
        self.extensionContext.cancelRequest(withError: BitwardenError.Internal("Invalid registration request"))
    }
    
    /*
     Prepare your UI to list available credentials for the user to choose from. The items in
     'serviceIdentifiers' describe the service the user is logging in to, so your extension can
     prioritize the most relevant credentials in the list.
     */
    override func prepareCredentialList(for serviceIdentifiers: [ASCredentialServiceIdentifier]) {
        logger.log("[autofill-extension] prepareCredentialList for serviceIdentifiers: \(serviceIdentifiers.count)")
        
        for serviceIdentifier in serviceIdentifiers {
            logger.log("     service: \(serviceIdentifier.identifier)")
        }
    }
    
    override func prepareCredentialList(for serviceIdentifiers: [ASCredentialServiceIdentifier], requestParameters: ASPasskeyCredentialRequestParameters) {
        logger.log("[autofill-extension] prepareCredentialList(passkey) for serviceIdentifiers: \(serviceIdentifiers.count)")
        logger.log("request parameters: \(requestParameters.relyingPartyIdentifier)")
        
        for serviceIdentifier in serviceIdentifiers {
            logger.log("     service: \(serviceIdentifier.identifier)")
        }
        
        
        class CallbackImpl: PreparePasskeyAssertionCallback {
            let ctx: ASCredentialProviderExtensionContext
            required init(_ ctx: ASCredentialProviderExtensionContext) {
                self.ctx = ctx
            }
            
            func onComplete(credential: PasskeyAssertionResponse) {
                ctx.completeAssertionRequest(using: ASPasskeyAssertionCredential(
                    userHandle: credential.userHandle,
                    relyingParty: credential.rpId,
                    signature: credential.signature,
                    clientDataHash: credential.clientDataHash,
                    authenticatorData: credential.authenticatorData,
                    credentialID: credential.credentialId
                ))
            }
            
            func onError(error: BitwardenError) {
                ctx.cancelRequest(withError: error)
            }
        }
        
        let userVerification = switch requestParameters.userVerificationPreference {
        case .preferred:
            UserVerification.preferred
        case .required:
            UserVerification.required
        default:
            UserVerification.discouraged
        }
        
        let req = PasskeyAssertionRequest(
            rpId: requestParameters.relyingPartyIdentifier,
            clientDataHash: requestParameters.clientDataHash,
            userVerification: userVerification,
            allowedCredentials: requestParameters.allowedCredentials,
            windowXy: self.getWindowPosition()
            
            //extensionInput: requestParameters.extensionInput,
        )
        
        self.client.preparePasskeyAssertion(request: req, callback: CallbackImpl(self.extensionContext))
        return
    }
    
    private func configureTimeoutUI() {
        self.view.isHidden = false;
    }
    
}
