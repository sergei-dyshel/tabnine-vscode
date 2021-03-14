/* eslint-disable no-restricted-syntax */
import * as vscode from "vscode";
import handleAlpha, { updatePersistedAlphaVersion } from "./alphaInstaller";
import pollDownloadProgress from "./binary/pollDownloadProgress";
import {
  deactivate as requestDeactivate,
  initBinary,
  uninstalling,
} from "./binary/requests/requests";
import {
  Capability,
  fetchCapabilitiesOnFocus,
  isCapabilityEnabled,
} from "./capabilities";
import { registerCommands } from "./commandsHandler";
import { COMPLETION_TRIGGERS } from "./consts";
import { tabnineContext } from "./extensionContext";
import handleUninstall from "./handleUninstall";
import { provideHover } from "./hovers/hoverHandler";
import pollNotifications, {
  cancelNotificationsPolling,
} from "./notifications/pollNotifications";
import provideCompletionItems from "./provideCompletionItems";
import {
  COMPLETION_IMPORTS,
  handleImports,
  HANDLE_IMPORTS,
  getSelectionHandler,
} from "./selectionHandler";
import pollStatuses, { disposeStatus } from "./statusBar/pollStatusBar";
import { registerStatusBar, setDefaultStatus } from "./statusBar/statusBar";
import { closeValidator } from "./validator/ValidatorClient";
import executeStartupActions from "./binary/startupActionsHandler";

let providerDisposers: vscode.Disposable[] = [];
let lastTrigger: string;
let channel: vscode.OutputChannel;

function getTrigger() {
  return vscode.workspace.getConfiguration().get<string>('tabnine.trigger', 'off');
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function onConfigurationChange(_: vscode.ConfigurationChangeEvent) {
  if (lastTrigger === getTrigger())
    return;
  lastTrigger = getTrigger();
  void vscode.window.showInformationMessage('"tabnine.trigger" changed');
  void registerAllProviders();
}

function complementLanguages(languages: string[], all: string[]): string[]
{
  const allSet = new Set<string>(all);
  for (const lang of languages)
    allSet.delete(lang);
  return Array.from(allSet);
}

async function registerAllProviders()
{
  channel.appendLine('Unregistering all');
  for (const disposer of providerDisposers)
    disposer.dispose()
  providerDisposers = []
  const allLanguages = await vscode.languages.getLanguages();
  if (lastTrigger === 'off') {
    providerDisposers.push(...registerProvider(allLanguages, false));
  } else if (lastTrigger === 'on') {
    providerDisposers.push(...registerProvider(allLanguages, true));
  } else {
    const languages = lastTrigger.split(',').sort().map(lang => lang.trim());
    providerDisposers.push(...registerProvider(languages, true));
    providerDisposers.push(...registerProvider(
        complementLanguages(languages, allLanguages), false));
  }
}

function registerProvider(languages: string[], trigger: boolean) {
  const triggers = trigger ? COMPLETION_TRIGGERS : [];

  channel.appendLine(
      `Registering trigger=${trigger} languages=${languages.join(', ')}`);

  return [
    vscode.languages.registerCompletionItemProvider(
        languages, {
          provideCompletionItems,
        },
        ...triggers),
    vscode.languages.registerHoverProvider(languages, {
      provideHover,
    })
  ]
}

export function activate(context: vscode.ExtensionContext): Promise<void> {
  initBinary();
  handleSelection(context);
  handleUninstall(() => uponUninstall(context));

  registerStatusBar(context);
  channel = vscode.window.createOutputChannel('tabnine');
  lastTrigger = getTrigger();
  vscode.workspace.onDidChangeConfiguration(onConfigurationChange);


  // Do not await on this function as we do not want VSCode to wait for it to finish
  // before considering TabNine ready to operate.
  void backgroundInit(context);

  return Promise.resolve();
}

async function backgroundInit(context: vscode.ExtensionContext) {
  // Goes to the binary to fetch what capabilities enabled:
  await fetchCapabilitiesOnFocus();

  if (
    isCapabilityEnabled(Capability.ALPHA_CAPABILITY) &&
    process.env.NODE_ENV !== "test"
  ) {
    void handleAlpha(context);
  }
  pollNotifications(context);
  pollStatuses(context);
  setDefaultStatus();
  registerCommands(context);
  pollDownloadProgress();
  void executeStartupActions();
  await registerAllProviders();
}

export async function deactivate(): Promise<unknown> {
  void closeValidator();
  cancelNotificationsPolling();
  disposeStatus();

  return requestDeactivate();
}
function uponUninstall(context: vscode.ExtensionContext): Promise<unknown> {
  void updatePersistedAlphaVersion(context, undefined);
  return uninstalling();
}

function handleSelection(context: vscode.ExtensionContext) {
  if (tabnineContext.isTabNineAutoImportEnabled) {
    context.subscriptions.push(
      vscode.commands.registerTextEditorCommand(
        COMPLETION_IMPORTS,
        getSelectionHandler(context)
      ),
      vscode.commands.registerTextEditorCommand(HANDLE_IMPORTS, handleImports)
    );
  }
}
