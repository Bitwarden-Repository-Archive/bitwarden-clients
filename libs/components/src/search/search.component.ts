// FIXME: Update this file to be type safe and remove this and next line
// @ts-strict-ignore
import { CommonModule } from "@angular/common";
import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from "@angular/core";
import {
  ControlValueAccessor,
  NG_VALUE_ACCESSOR,
  ReactiveFormsModule,
  FormsModule,
} from "@angular/forms";
import { BehaviorSubject, map } from "rxjs";

import { isBrowserSafariApi } from "@bitwarden/platform";
import { I18nPipe } from "@bitwarden/ui-common";

import { IconButtonModule } from "../icon-button";
import { InputModule } from "../input/input.module";
import { LinkModule } from "../link";
import { FocusableElement } from "../shared/focusable-element";

let nextId = 0;

@Component({
  selector: "bit-search",
  templateUrl: "./search.component.html",
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: SearchComponent,
    },
    {
      provide: FocusableElement,
      useExisting: SearchComponent,
    },
  ],
  standalone: true,
  imports: [
    InputModule,
    ReactiveFormsModule,
    FormsModule,
    I18nPipe,
    CommonModule,
    IconButtonModule,
    LinkModule,
  ],
})
export class SearchComponent implements ControlValueAccessor, FocusableElement {
  private notifyOnChange: (v: string) => void;
  private notifyOnTouch: () => void;

  @ViewChild("input") private input: ElementRef<HTMLInputElement>;

  protected id = `search-id-${nextId++}`;
  protected searchText: string;
  // Use `type="text"` for Safari to improve rendering performance
  protected inputType = isBrowserSafariApi() ? ("text" as const) : ("search" as const);
  private focused = false;
  protected textUpdated$ = new BehaviorSubject<string>("");
  protected showSavedFilters = false;

  @Input() disabled: boolean;
  @Input() placeholder: string;
  @Input() autocomplete: string;
  @Input() history: string[] | null;
  @Input() savedFilters: Record<string, string> | null;
  @Output() filterSaved = new EventEmitter<{ name: string; filter: string }>();
  @Output() filterDeleted = new EventEmitter<{ name: string; filter: string }>();

  get savedFilterData() {
    if (this.savedFilters == null) {
      return [];
    }

    return Object.entries(this.savedFilters).map(([name, filter]) => {
      return {
        name,
        filter,
      };
    });
  }

  get showHistory() {
    // turn off history for now
    return false;
    return this.history != null && this.focused;
  }

  get filteredHistory$() {
    // TODO: Not clear if filtering is better or worse
    return this.textUpdated$.pipe(map((text) => this.history));
    // return this.textUpdated$.pipe(map((text) => this.history.filter((h) => h.startsWith(text))));
  }

  private _selectedContent = new BehaviorSubject<string | null>(null);

  selectedContent$ = this._selectedContent.asObservable();

  onFocus() {
    this.focused = true;
  }

  getFocusTarget() {
    return this.input.nativeElement;
  }

  onChange(searchText: string) {
    if (this.notifyOnChange != undefined) {
      this.notifyOnChange(searchText);
    }
    this.searchText = searchText;
    this.textUpdated$.next(searchText);
  }

  onTouch() {
    // Need to provide enough time for a history option to be selected, it if it's clicked
    setTimeout(() => (this.focused = false), 100);
    if (this.notifyOnTouch != undefined) {
      this.notifyOnTouch();
    }
  }

  registerOnChange(fn: (v: string) => void): void {
    this.notifyOnChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.notifyOnTouch = fn;
  }

  writeValue(searchText: string): void {
    this.searchText = searchText;
  }

  setDisabledState(isDisabled: boolean) {
    this.disabled = isDisabled;
  }

  toggleSavedFilters() {
    this.showSavedFilters = !this.showSavedFilters;
  }

  filterToggled() {
    this._selectedContent.next(this._selectedContent.value !== "filter" ? "filter" : null);
  }

  filterShown() {
    return this._selectedContent.value !== "filter";
  }

  saveFilter() {
    this.filterSaved.emit({
      name: this.searchText,
      filter: this.searchText,
    });
  }

  deleteFilter(toDelete: { name: string; filter: string }) {
    this.filterDeleted.emit(toDelete);
  }
}
