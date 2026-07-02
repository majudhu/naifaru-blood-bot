import { expect, vi } from "vitest";

import * as schema from "../../server/schema";
import {
  bloodTypeValues,
  DAY_MS,
  donorResponseStatusValues,
  EPOCH_STRING,
  requestStatusValues,
  staffRoleValues,
} from "../../shared/utils/const";
import { createError } from "./h3-stub";

type MockFn = ReturnType<typeof vi.fn<(...args: unknown[]) => unknown>>;

type TestSession = {
  user: {
    id?: number;
    name?: string;
    role?: string;
  };
};

export type TestEvent = {
  body?: unknown;
  db: ReturnType<typeof createDbMock>;
  params: Record<string, string | undefined>;
  query: Record<string, string | undefined>;
  session: TestSession;
  writtenSession?: unknown;
};

type QueryChain<T> = {
  from: MockFn;
  groupBy: MockFn;
  limit: MockFn;
  offset: MockFn;
  orderBy: MockFn;
  returning: MockFn;
  set: MockFn;
  values: MockFn;
  where: MockFn;
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
};

function createQueryChain<T>(result: T): QueryChain<T> {
  const chain = {} as QueryChain<T>;

  chain.from = vi.fn<(...args: unknown[]) => QueryChain<T>>(() => chain);
  chain.groupBy = vi.fn<(...args: unknown[]) => QueryChain<T>>(() => chain);
  chain.limit = vi.fn<(...args: unknown[]) => QueryChain<T>>(() => chain);
  chain.offset = vi.fn<(...args: unknown[]) => QueryChain<T>>(() => chain);
  chain.orderBy = vi.fn<(...args: unknown[]) => QueryChain<T>>(() => chain);
  chain.returning = vi.fn<(...args: unknown[]) => Promise<T>>(() => Promise.resolve(result));
  chain.set = vi.fn<(...args: unknown[]) => QueryChain<T>>(() => chain);
  chain.values = vi.fn<(...args: unknown[]) => QueryChain<T>>(() => chain);
  chain.where = vi.fn<(...args: unknown[]) => QueryChain<T>>(() => chain);

  // oxlint-disable-next-line unicorn/no-thenable -- Drizzle query builders are awaited in handlers.
  Object.defineProperty(chain, "then", {
    value<TResult1 = T, TResult2 = never>(
      onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve(result).then(onfulfilled, onrejected);
    },
  });

  return chain;
}

function nextQueued(queue: QueryChain<unknown>[], fallback: unknown) {
  return queue.shift() ?? createQueryChain(fallback);
}

export function createDbMock() {
  const selectQueue: QueryChain<unknown>[] = [];
  const insertQueue: QueryChain<unknown>[] = [];
  const updateQueue: QueryChain<unknown>[] = [];
  const deleteQueue: QueryChain<unknown>[] = [];

  return {
    delete: vi.fn<() => QueryChain<unknown>>(() =>
      nextQueued(deleteQueue, { meta: { changes: 0 } }),
    ),
    insert: vi.fn<() => QueryChain<unknown>>(() => nextQueued(insertQueue, [])),
    query: {
      staff: {
        findMany: vi.fn<(...args: unknown[]) => unknown>(),
      },
    },
    queueDelete<T>(result: T) {
      const chain = createQueryChain(result);
      deleteQueue.push(chain as QueryChain<unknown>);
      return chain;
    },
    queueInsert<T>(result: T) {
      const chain = createQueryChain(result);
      insertQueue.push(chain as QueryChain<unknown>);
      return chain;
    },
    queueSelect<T>(result: T) {
      const chain = createQueryChain(result);
      selectQueue.push(chain as QueryChain<unknown>);
      return chain;
    },
    queueUpdate<T>(result: T) {
      const chain = createQueryChain(result);
      updateQueue.push(chain as QueryChain<unknown>);
      return chain;
    },
    select: vi.fn<() => QueryChain<unknown>>(() => nextQueued(selectQueue, [])),
    update: vi.fn<() => QueryChain<unknown>>(() =>
      nextQueued(updateQueue, { meta: { changes: 0 } }),
    ),
  };
}

export function createEvent(overrides: Partial<TestEvent> = {}): TestEvent {
  return {
    body: undefined,
    db: createDbMock(),
    params: {},
    query: {},
    session: { user: { id: 1, name: "Admin", role: "admin" } },
    ...overrides,
  };
}

export const autoImportMocks = {
  createError:
    vi.fn<(input: Parameters<typeof createError>[0]) => ReturnType<typeof createError>>(),
  defineEventHandler: vi.fn<(handler: unknown) => unknown>(),
  getQuery: vi.fn<(event: TestEvent) => Record<string, string | undefined>>(),
  getRouterParam: vi.fn<(event: TestEvent, key: string) => string | undefined>(),
  hashPassword: vi.fn<(password: string) => Promise<string>>(),
  readValidatedBody:
    vi.fn<(event: TestEvent, parser: (input: unknown) => unknown) => Promise<unknown>>(),
  requireUserSession: vi.fn<(event: TestEvent) => Promise<TestSession>>(),
  setUserSession: vi.fn<(event: TestEvent, session: unknown) => Promise<void>>(),
  useDb: vi.fn<(event: TestEvent) => TestEvent["db"]>(),
  verifyPassword: vi.fn<(hash: string, password: string) => Promise<boolean>>(),
};

export function installApiTestGlobals() {
  autoImportMocks.createError.mockImplementation((input: Parameters<typeof createError>[0]) => {
    const error = createError(input);
    const status =
      typeof input === "object" && input !== null && "status" in input ? input.status : undefined;
    if (typeof status === "number") error.statusCode = status;
    return error;
  });
  autoImportMocks.defineEventHandler.mockImplementation((handler: unknown) => handler);
  autoImportMocks.getQuery.mockImplementation((event: TestEvent) => event.query);
  autoImportMocks.getRouterParam.mockImplementation(
    (event: TestEvent, key: string) => event.params[key],
  );
  autoImportMocks.hashPassword.mockImplementation(async (password: string) => `hashed:${password}`);
  autoImportMocks.readValidatedBody.mockImplementation(
    async (event: TestEvent, parser: (input: unknown) => unknown) => parser(event.body),
  );
  autoImportMocks.requireUserSession.mockImplementation(async (event: TestEvent) => event.session);
  autoImportMocks.setUserSession.mockImplementation(async (event: TestEvent, session: unknown) => {
    event.writtenSession = session;
  });
  autoImportMocks.useDb.mockImplementation((event: TestEvent) => event.db);
  autoImportMocks.verifyPassword.mockImplementation(async () => false);

  vi.stubGlobal("bloodTypeValues", bloodTypeValues);
  vi.stubGlobal("createError", autoImportMocks.createError);
  vi.stubGlobal("DAY_MS", DAY_MS);
  vi.stubGlobal("defineEventHandler", autoImportMocks.defineEventHandler);
  vi.stubGlobal("donorResponseStatusValues", donorResponseStatusValues);
  vi.stubGlobal("EPOCH_STRING", EPOCH_STRING);
  vi.stubGlobal("getQuery", autoImportMocks.getQuery);
  vi.stubGlobal("getRouterParam", autoImportMocks.getRouterParam);
  vi.stubGlobal("hashPassword", autoImportMocks.hashPassword);
  vi.stubGlobal("readValidatedBody", autoImportMocks.readValidatedBody);
  vi.stubGlobal("requestStatusValues", requestStatusValues);
  vi.stubGlobal("requireUserSession", autoImportMocks.requireUserSession);
  vi.stubGlobal("schema", schema);
  vi.stubGlobal("setUserSession", autoImportMocks.setUserSession);
  vi.stubGlobal("staffRoleValues", staffRoleValues);
  vi.stubGlobal("useDb", autoImportMocks.useDb);
  vi.stubGlobal("verifyPassword", autoImportMocks.verifyPassword);
}

export function expectHttpError(error: unknown, statusCode: number) {
  expect(error).toMatchObject({ statusCode });
}
