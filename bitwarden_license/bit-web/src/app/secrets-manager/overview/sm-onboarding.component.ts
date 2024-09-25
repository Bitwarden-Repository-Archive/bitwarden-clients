import { Component, OnDestroy, OnInit } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import {
  map,
  Observable,
  Subject,
  takeUntil,
  distinctUntilChanged,
  firstValueFrom,
  combineLatest,
  switchMap,
  tap,
  shareReplay,
} from "rxjs";

import { OrganizationService } from "@bitwarden/common/admin-console/abstractions/organization/organization.service.abstraction";
import { DialogService } from "@bitwarden/components";

import {
  ProjectDialogComponent,
  ProjectOperation,
} from "../projects/dialog/project-dialog.component";
import {
  OperationType,
  SecretDialogComponent,
  SecretOperation,
} from "../secrets/dialog/secret-dialog.component";
import {
  ServiceAccountDialogComponent,
  ServiceAccountOperation,
} from "../service-accounts/dialog/service-account-dialog.component";

import { SMOnboardingTasks, SMOnboardingTasksService } from "./sm-onboarding-tasks.service";

type OrganizationTasks = {
  importData: boolean;
  inviteYourTeam: boolean;
  setUpIntegrations: boolean;
  installTheCLI: boolean;
  createProject: boolean;
  createSecret: boolean;
  createServiceAccount: boolean;
  createAccessToken: boolean;
};

@Component({
  selector: "sm-onboarding",
  templateUrl: "./sm-onboarding.component.html",
})
export class SMOnboardingComponent implements OnInit, OnDestroy {
  private destroy$: Subject<void> = new Subject<void>();
  private prevOrgTasks: OrganizationTasks;
  private prevTasks: any;
  private organizationId: string;
  protected organizationEnabled = false;
  protected loading = true;
  protected tasks: SMOnboardingTasks;
  protected firstIncompleteTaskKey: string;
  protected userIsAdmin: boolean;
  protected linuxAndMacOS1: string = "curl https://bws.bitwarden.com/install | sh";
  protected linuxAndMacOS2: string = "wget -O - https://bws.bitwarden.com/install | sh";
  protected windows: string = "iwr https://bws.bitwarden.com/install | iex";
  protected createAccessTokenCreationInstructionsLink =
    "https://bitwarden.com/help/secrets-manager-quick-start/#create-an-access-token";

  protected view$: Observable<{
    tasks: OrganizationTasks;
    organizationId: string;
    userIsAdmin: boolean;
    organizationEnabled: boolean;
    inviteYourTeamLink: string;
    firstIncompleteTaskKey: string;
  }>;

  constructor(
    private route: ActivatedRoute,
    private dialogService: DialogService,
    private organizationService: OrganizationService,
    private smOnboardingTasksService: SMOnboardingTasksService,
    private router: Router,
  ) {}

  protected updateOnboardingTasks$ = new Subject<string>();

  importDataCompleted: boolean = false;
  installTheCLICompleted: boolean = false;
  setUpIntegrationsCompleted: boolean = false;
  createAccessTokenCompleted: boolean = false;
  createServiceAccountCompleted: boolean = false;
  createSecretCompleted: boolean = false;
  createProjectCompleted: boolean = false;
  inviteYourTeamCompleted: boolean = false;
  showCompletedDialog: boolean = true;

  ngOnInit() {
    this.initialize();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initialize() {

    const organization$ = this.route.params.pipe(
      map(params => params.organizationId),
      distinctUntilChanged(),
      switchMap(orgId => this.organizationService.get(orgId)),
      shareReplay({ refCount: false, bufferSize: 1 })
    );
    
    const tasks$ = combineLatest([
      organization$,
      this.smOnboardingTasksService.smOnboardingTasks$
    ]).pipe(
      switchMap(([org, _]) => this.getCurrentStateOfOrgTasks(org.id))
    );

    this.view$ = combineLatest([
      organization$,
      tasks$,
      organization$.pipe(
        switchMap(org => this.smOnboardingTasksService.findFirstFalseTask(org.isAdmin, org.id))
      )
    ]).pipe(
      map(([org, tasks, firstIncompleteTaskKey]) => ({
        tasks,
        organizationId: org.id,
        userIsAdmin: org.isAdmin,
        organizationEnabled: org.enabled,
        inviteYourTeamLink: `/#/organizations/${org.id}/members`,
        firstIncompleteTaskKey,
      })),
      tap(view => {
        this.organizationId = view.organizationId;
        this.organizationEnabled = view.organizationEnabled;
        this.firstIncompleteTaskKey = view.firstIncompleteTaskKey;
        this.userIsAdmin = view.userIsAdmin;
        this.loading = false;
      }),
      takeUntil(this.destroy$)
    );

    this.updateOnboardingTasks$.pipe(
      switchMap(taskToUpdate => this.updateOnboardingTasks(this.organizationId, taskToUpdate))).subscribe()
  }

  private async getCurrentStateOfOrgTasks(orgId: string): Promise<OrganizationTasks> {
    var tasks = await firstValueFrom(this.smOnboardingTasksService.smOnboardingTasks$);
      this.prevTasks = tasks as {
        [organizationId: string]: OrganizationTasks;
      };
      this.prevOrgTasks = this.prevTasks[orgId];
      return this.prevOrgTasks;
  }

  private async saveCompletedTasks(
    organizationId: string,
    orgTasks: OrganizationTasks,
  ): Promise<OrganizationTasks> {
    let prevCompletedOrgTasks = null;
    if (this.prevOrgTasks != null || this.prevOrgTasks != undefined) {
      prevCompletedOrgTasks = Object.fromEntries(
        Object.entries(this.prevOrgTasks).filter(([_k, v]) => v === true),
      );
    }

    const newlyCompletedOrgTasks = Object.fromEntries(
      Object.entries(orgTasks).filter(([_k, v]) => v === true),
    );

    const nextOrgTasks = {
      importData: false,
      inviteYourTeam: false,
      setUpIntegrations: false,
      installTheCLI: false,
      createProject: false,
      createSecret: false,
      createServiceAccount: false,
      createAccessToken: false,
      ...this.prevOrgTasks,
      ...newlyCompletedOrgTasks,
    };

    await this.smOnboardingTasksService.setSmOnboardingTasks({
      ...this.prevTasks,
      [organizationId]: nextOrgTasks,
    });

    this.firstIncompleteTaskKey = await this.smOnboardingTasksService.findFirstFalseTask(
      this.userIsAdmin,
      organizationId,
    );
    this.showCompletedDialog =
      (this.firstIncompleteTaskKey == "" || this.firstIncompleteTaskKey == null) &&
      Object.keys(newlyCompletedOrgTasks).length > 0 &&
      Object.keys(newlyCompletedOrgTasks).length != Object.keys(prevCompletedOrgTasks).length;

    return nextOrgTasks as OrganizationTasks;
  }

  private async updateOnboardingTasks(orgId: string, onboardingTaskToUpdate: string) {
      const updatedTasks = await this.saveCompletedTasks(orgId, {
        createSecret: onboardingTaskToUpdate === "createSecretCompleted",
        createProject: onboardingTaskToUpdate === "createProjectCompleted",
        createServiceAccount: onboardingTaskToUpdate === "createServiceAccountCompleted",
        createAccessToken: onboardingTaskToUpdate === "createAccessTokenCompleted",
        importData: onboardingTaskToUpdate === "importDataCompleted",
        inviteYourTeam: onboardingTaskToUpdate === "inviteYourTeamCompleted",
        setUpIntegrations: onboardingTaskToUpdate === "setUpIntegrationsCompleted",
        installTheCLI: onboardingTaskToUpdate === "installTheCLICompleted",
    });

    if (this.showCompletedDialog) {
      await this.showOnboardingCompletedDialog();
    }
    return updatedTasks;
  }

  async showOnboardingCompletedDialog() {
    const confirmed = await this.dialogService.openSimpleDialog({
      title: { key: "youveCompletedGettingStarted" },
      content: { key: "ifYouNeedToReferBackToTheGuide" },
      type: "success",
      acceptButtonText: { key: "ok" },
      cancelButtonText: { key: "close" },
    });

    if (confirmed) {
      await this.router.navigate(["/sm/", this.organizationId]);
    }
  }

  async openCreateAccessTokenDocumentation(setComplete: boolean) {
    if (setComplete) {
      await this.completeCreateAccessToken();
    }
  }

  async openNewSecretDialog(setComplete: boolean) {
    if (setComplete) {
      await this.completeCreateSecret();
    }

    this.dialogService.open<unknown, SecretOperation>(SecretDialogComponent, {
      data: {
        organizationId: this.organizationId,
        operation: OperationType.Add,
        organizationEnabled: this.organizationEnabled,
      },
    });
  }

  async openNewProjectDialog(setComplete: boolean) {
    if (setComplete) {
      await this.completeCreateProject();
    }

    this.dialogService.open<unknown, ProjectOperation>(ProjectDialogComponent, {
      data: {
        organizationId: this.organizationId,
        operation: OperationType.Add,
        organizationEnabled: this.organizationEnabled,
      },
    });
  }

  async openServiceAccountDialog(setComplete: boolean) {
    if (setComplete) {
      await this.completeCreateServiceAccount();
    }

    this.dialogService.open<unknown, ServiceAccountOperation>(ServiceAccountDialogComponent, {
      data: {
        organizationId: this.organizationId,
        operation: OperationType.Add,
        organizationEnabled: this.organizationEnabled,
      },
    });
  }

  async completeImportData() {
    this.importDataCompleted = true;
    this.updateOnboardingTasks$.next("importDataCompleted");
  }

  async completeInviteYourTeam() {
    this.inviteYourTeamCompleted = true;
    this.updateOnboardingTasks$.next("inviteYourTeamCompleted");
  }

  async completeInstallTheCLI() {
    this.installTheCLICompleted = true;
    this.updateOnboardingTasks$.next("installTheCLICompleted");
  }

  async completeSetUpIntegrations() {
    this.setUpIntegrationsCompleted = true;
    this.updateOnboardingTasks$.next("setUpIntegrationsCompleted");
  }

  async completeCreateAccessToken() {
    this.createAccessTokenCompleted = true;
    this.updateOnboardingTasks$.next("createAccessTokenCompleted");
  }

  async completeCreateServiceAccount() {
    this.createServiceAccountCompleted = true;
    this.updateOnboardingTasks$.next("createServiceAccountCompleted");
  }

  async completeCreateSecret() {
    this.createSecretCompleted = true;
    this.updateOnboardingTasks$.next("createSecretCompleted");
  }

  async completeCreateProject() {
    this.createProjectCompleted = true;
    this.updateOnboardingTasks$.next("createProjectCompleted");
  }
}
