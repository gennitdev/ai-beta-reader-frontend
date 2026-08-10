# Privacy Policy

_Effective August 10, 2026_

> **In short:** beta bot is a local-first writing application. It does not require an account or operate an application server that receives your manuscripts. Optional Google Drive backups are encrypted on your device and stored in your own Drive.

## 1. Scope of this policy

This policy explains how beta bot ("beta bot," "we," or "the app operator") handles information when you use the beta bot website, browser app, desktop app, or mobile app. beta bot is designed so that the app operator does not collect or maintain a central copy of your writing.

## 2. Information stored on your device

beta bot stores app data locally on your device, which may include:

- manuscripts, chapters, notes, summaries, wiki entries, AI reviewer profiles, and images;
- app preferences and Bardwall game progress;
- your OpenAI API key, if you choose to save one; and
- Google OAuth tokens used for optional Google Drive backup and restore.

This local data is under your control. The app operator does not receive it and cannot recover it for you. Clearing the app's site data, uninstalling the app, or deleting local app storage may permanently remove it.

## 3. Optional OpenAI features

If you add your own OpenAI API key and invoke an AI feature, the content needed for that feature is sent directly from your device to OpenAI. This may include manuscript excerpts, summaries, wiki content, prompts, or Bardwall story text. beta bot does not route these requests through an operator-controlled server and does not retain a copy of the transmission.

OpenAI processes that information under the terms and privacy choices associated with your OpenAI account and API use. Your OpenAI API key is stored locally and is not included in your Google Drive backup.

## 4. Optional Google Drive backup and restore

beta bot asks for Google Drive access only when you choose the backup or restore feature. The app requests the narrow `https://www.googleapis.com/auth/drive.file` permission. This permits beta bot to create, find, update, and read files it created or that you explicitly shared with it; it does not grant access to unrelated files in your Drive.

beta bot uses this permission to create, locate, update, and restore the encrypted backup file named `ai-beta-reader-backup.enc`. The backup may contain the local app data listed above. It is compressed and encrypted on your device before upload using the password you provide. The password is not stored by beta bot or sent to Google, and the app operator cannot decrypt or access your backup.

Google OAuth tokens are stored locally on your device and are used only to perform the backup and restore actions you request. beta bot does not sell Google user data, use it for advertising, or use it to train generalized AI or machine-learning models.

beta bot's use of information received from Google Workspace APIs will adhere to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

## 5. Sharing and transfers

beta bot does not sell, rent, or share your manuscript or Google Drive data with advertisers or data brokers.

Information leaves your device only when you direct the app to use a third-party feature:

- Google receives the encrypted backup and OAuth requests needed to store or restore it in your Drive.
- OpenAI receives content you submit to an AI feature using your API key. beta bot does not send Google OAuth tokens or the encrypted Drive backup file to OpenAI.

The beta-bot.net hosting and network providers may process standard technical request information, such as IP address, browser type, and request time, as needed to deliver and secure the website. beta bot does not use advertising trackers or analytics to build profiles of users.

## 6. Retention, deletion, and revoking access

- Delete local data by using available app controls, clearing beta bot's browser/site storage, or uninstalling the app.
- Delete the cloud backup by deleting `ai-beta-reader-backup.enc` from your Google Drive trash and emptying the trash if you want immediate permanent deletion.
- Revoke beta bot's Google access from the third-party connections page in your Google Account. You may also clear beta bot's local app or site data to remove locally stored tokens.

Because the app operator does not hold a server-side copy of your app content or backup, there is ordinarily no operator-held manuscript data to delete. For help with these steps, email [gennitdev@gmail.com](mailto:gennitdev@gmail.com).

## 7. Security

beta bot uses on-device authenticated encryption for new backups and limits Google authorization to the `drive.file` scope. No system can guarantee absolute security. You are responsible for protecting your device, API keys, Google account, and backup password. If you lose the backup password, beta bot cannot recover it or decrypt the backup.

## 8. Children

beta bot is not directed to children under 13, and the app operator does not knowingly collect personal information from children. If you believe a child has provided information to the operator, contact us so we can investigate.

## 9. Changes and contact

We may update this policy as the app or applicable requirements change. The effective date above identifies the current version. Questions, privacy requests, and deletion-assistance requests may be sent to [gennitdev@gmail.com](mailto:gennitdev@gmail.com).
