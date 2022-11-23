import * as vscode from 'vscode';

import {Capability, isCapabilityEnabled} from './capabilities';

export enum SuggestionsMode {
  INLINE,
  AUTOCOMPLETE,
}

export default function getSuggestionMode(): SuggestionsMode {
  if (isCapabilityEnabled(Capability.INLINE_SUGGESTIONS) &&
      vscode.workspace.getConfiguration().get<boolean>(
          'editor.inlineSuggest.enabled', true)) {
    return SuggestionsMode.INLINE;
  }
  return SuggestionsMode.AUTOCOMPLETE;
}
