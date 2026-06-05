import * as vscode from 'vscode';

export class Logger {
  private static outputChannel: vscode.OutputChannel;

  static initialize(): void {
    if (!this.outputChannel) {
      this.outputChannel = vscode.window.createOutputChannel('Git IDE');
    }
  }

  static info(message: string): void {
    this.initialize();
    this.outputChannel.appendLine(`[INFO] ${new Date().toISOString()} ${message}`);
  }

  static error(message: string, error?: Error): void {
    this.initialize();
    this.outputChannel.appendLine(`[ERROR] ${new Date().toISOString()} ${message}`);
    if (error) {
      this.outputChannel.appendLine(error.stack || error.message);
    }
  }

  static warn(message: string): void {
    this.initialize();
    this.outputChannel.appendLine(`[WARN] ${new Date().toISOString()} ${message}`);
  }

  static debug(message: string): void {
    this.initialize();
    this.outputChannel.appendLine(`[DEBUG] ${new Date().toISOString()} ${message}`);
  }

  static dispose(): void {
    this.outputChannel?.dispose();
  }
}
