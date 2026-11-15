export type Credentials = { token: string; refreshToken?: string };

type Snapshot = { credentials: Credentials | null; generation: number };

function decode(value: string | null): Credentials | null {
  if (!value) return null;
  if (!value.startsWith('{')) return { token: value };
  const { token, refreshToken } = JSON.parse(value) as Partial<Credentials>;
  if (!token || !refreshToken) throw new Error('Invalid stored credentials');
  return { token, refreshToken };
}

export class SessionCredentials {
  private state?: Snapshot;
  private queue: Promise<unknown> = Promise.resolve();
  private renewal?: { snapshot: Snapshot; result: Promise<Snapshot | undefined> };

  constructor(private readonly storage: {
    read: () => Promise<string | null>;
    write: (value: string | null) => Promise<void>;
  }) {}

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => {});
    return result;
  }

  private async load(): Promise<Snapshot> {
    this.state ??= { credentials: decode(await this.storage.read()), generation: 0 };
    return this.state;
  }

  read(): Promise<Snapshot> {
    return this.serialize(() => this.load());
  }

  replace(credentials: Credentials | null): Promise<Snapshot> {
    return this.serialize(async () => {
      const previous = await this.load();
      await this.write(credentials, previous.generation + 1);
      return previous;
    });
  }

  private async write(credentials: Credentials | null, generation: number): Promise<Snapshot> {
    await this.storage.write(credentials?.refreshToken ? JSON.stringify(credentials) : credentials?.token ?? null);
    this.state = { credentials, generation };
    return this.state;
  }

  async recover(
    rejected: Snapshot,
    renew: (refreshToken: string) => Promise<Credentials | null>,
    invalidated: () => void,
  ): Promise<Snapshot | undefined> {
    const current = await this.read();
    if (current.generation !== rejected.generation || !current.credentials) return undefined;
    if (current !== rejected) return current;
    if (this.renewal?.snapshot === rejected) return this.renewal.result;

    const result = (async () => {
      const replacement = current.credentials?.refreshToken ? await renew(current.credentials.refreshToken) : null;
      return this.serialize(async () => {
        if (this.state !== rejected) return undefined;
        const written = await this.write(replacement, current.generation);
        if (replacement) return written;
        invalidated();
        return undefined;
      });
    })();
    this.renewal = { snapshot: rejected, result };
    try {
      return await result;
    } finally {
      if (this.renewal?.result === result) this.renewal = undefined;
    }
  }
}
