import { LogService as LogServiceAbstraction } from "../abstractions/log.service";
import { LogLevelType } from "../enums/log-level-type.enum";

export class ConsoleLogService implements LogServiceAbstraction {
  protected timersMap: Map<string, [number, number]> = new Map();

  constructor(
    protected isDev: boolean,
    protected _filter: (level: LogLevelType) => boolean = null,
  ) {}

  protected get filter(): (level: LogLevelType) => boolean {
    return this._filter ?? (() => true);
  }

  updateFilter(filter: (level: LogLevelType) => boolean) {
    if (filter === null) {
      this.write(LogLevelType.Warning, "Log level filter cannot be null");
      return;
    }
    this._filter = filter;
  }

  debug(message?: any, ...optionalParams: any[]) {
    if (!this.isDev) {
      return;
    }
    this.write(LogLevelType.Debug, message, ...optionalParams);
  }

  info(message?: any, ...optionalParams: any[]) {
    this.write(LogLevelType.Info, message, ...optionalParams);
  }

  warning(message?: any, ...optionalParams: any[]) {
    this.write(LogLevelType.Warning, message, ...optionalParams);
  }

  error(message?: any, ...optionalParams: any[]) {
    this.write(LogLevelType.Error, message, ...optionalParams);
  }

  write(level: LogLevelType, message?: any, ...optionalParams: any[]) {
    if (!this.filter(level)) {
      return;
    }

    switch (level) {
      case LogLevelType.Debug:
        // eslint-disable-next-line
        console.log(message, ...optionalParams);
        break;
      case LogLevelType.Info:
        // eslint-disable-next-line
        console.log(message, ...optionalParams);
        break;
      case LogLevelType.Warning:
        // eslint-disable-next-line
        console.warn(message, ...optionalParams);
        break;
      case LogLevelType.Error:
        // eslint-disable-next-line
        console.error(message, ...optionalParams);
        break;
      default:
        break;
    }
  }
}
