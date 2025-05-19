import { css } from "@emotion/css";
// import { Signal } from "@lit-labs/signals";
import { html, nothing } from "lit";

import { Theme } from "@bitwarden/common/platform/enums";

import {
  NotificationType,
  NotificationTypes,
} from "../../../notification/abstractions/notification-bar";
import { OrgView, FolderView, I18n, CollectionView } from "../common-types";
import { spacing } from "../constants/styles";
// import { notificationIsLoading as notificationIsLoadingSignal } from "../signals/notification-load-state";

import { NotificationButtonRow } from "./button-row";

export type NotificationFooterProps = {
  collections?: CollectionView[];
  folders?: FolderView[];
  i18n: I18n;
  isLoading?: boolean;
  notificationType?: NotificationType;
  organizations?: OrgView[];
  personalVaultIsAllowed: boolean;
  theme: Theme;
  handleSaveAction: (e: Event) => void;
};

export function NotificationFooter({
  collections,
  folders,
  i18n,
  isLoading,
  notificationType,
  organizations,
  personalVaultIsAllowed,
  theme,
  handleSaveAction,
}: NotificationFooterProps) {
  const isChangeNotification = notificationType === NotificationTypes.Change;
  const isUnlockNotification = notificationType === NotificationTypes.Unlock;

  let primaryButtonText = i18n.saveAction;

  if (isUnlockNotification) {
    primaryButtonText = i18n.notificationUnlock;
  }

  // let isLoading = notificationIsLoadingSignal.get();
  console.log('NotificationFooter isLoading:', isLoading);

  // const isLoadingWatcher = new Signal.subtle.Watcher(async () => {
  //   // Notify callbacks are not allowed to access signals synchronously
  //   await 0;
  //   isLoading = await notificationIsLoadingSignal.get();
  //   console.log('watcher isLoading:', isLoading);

  //   // Watchers have to be re-enabled after they run:
  //   isLoadingWatcher.watch();
  // });
  // isLoadingWatcher.watch(notificationIsLoadingSignal);

  // isLoading = notificationIsLoadingSignal.get();

  return html`
    <div class=${notificationFooterStyles({ isChangeNotification })}>
      ${!isChangeNotification
        ? NotificationButtonRow({
            collections,
            folders,
            organizations,
            i18n,
            primaryButton: {
              handlePrimaryButtonClick: handleSaveAction,
              isLoading,
              text: primaryButtonText,
            },
            personalVaultIsAllowed,
            theme,
          })
        : nothing}
    </div>
  `;
}

const notificationFooterStyles = ({
  isChangeNotification,
}: {
  isChangeNotification: boolean;
}) => css`
  display: flex;
  padding: ${spacing[2]} ${spacing[4]} ${isChangeNotification ? spacing[1] : spacing[4]}
    ${spacing[4]};

  :last-child {
    border-radius: 0 0 ${spacing["4"]} ${spacing["4"]};
  }
`;
