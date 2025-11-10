/**
 * Client
 **/

import * as runtime from './runtime/library.js';
import $Types = runtime.Types; // general types
import $Public = runtime.Types.Public;
import $Utils = runtime.Types.Utils;
import $Extensions = runtime.Types.Extensions;
import $Result = runtime.Types.Result;

export type PrismaPromise<T> = $Public.PrismaPromise<T>;

/**
 * Model Admin
 *
 */
export type Admin = $Result.DefaultSelection<Prisma.$AdminPayload>;
/**
 * Model ViewerAuth
 *
 */
export type ViewerAuth = $Result.DefaultSelection<Prisma.$ViewerAuthPayload>;
/**
 * Model SkillSheet
 *
 */
export type SkillSheet = $Result.DefaultSelection<Prisma.$SkillSheetPayload>;

/**
 * ##  Prisma Client ʲˢ
 *
 * Type-safe database client for TypeScript & Node.js
 * @example
 * ```
 * const prisma = new PrismaClient()
 * // Fetch zero or more Admins
 * const admins = await prisma.admin.findMany()
 * ```
 *
 *
 * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
 */
export class PrismaClient<
  ClientOptions extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions,
  const U = 'log' extends keyof ClientOptions
    ? ClientOptions['log'] extends Array<Prisma.LogLevel | Prisma.LogDefinition>
      ? Prisma.GetEvents<ClientOptions['log']>
      : never
    : never,
  ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
> {
  [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['other'] };

  /**
   * ##  Prisma Client ʲˢ
   *
   * Type-safe database client for TypeScript & Node.js
   * @example
   * ```
   * const prisma = new PrismaClient()
   * // Fetch zero or more Admins
   * const admins = await prisma.admin.findMany()
   * ```
   *
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
   */

  constructor(optionsArg?: Prisma.Subset<ClientOptions, Prisma.PrismaClientOptions>);
  $on<V extends U>(
    eventType: V,
    callback: (event: V extends 'query' ? Prisma.QueryEvent : Prisma.LogEvent) => void,
  ): PrismaClient;

  /**
   * Connect with the database
   */
  $connect(): $Utils.JsPromise<void>;

  /**
   * Disconnect from the database
   */
  $disconnect(): $Utils.JsPromise<void>;

  /**
   * Executes a prepared raw query and returns the number of affected rows.
   * @example
   * ```
   * const result = await prisma.$executeRaw`UPDATE User SET cool = ${true} WHERE email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Executes a raw query and returns the number of affected rows.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$executeRawUnsafe('UPDATE User SET cool = $1 WHERE email = $2 ;', true, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Performs a prepared raw query and returns the `SELECT` data.
   * @example
   * ```
   * const result = await prisma.$queryRaw`SELECT * FROM User WHERE id = ${1} OR email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<T>;

  /**
   * Performs a raw query and returns the `SELECT` data.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$queryRawUnsafe('SELECT * FROM User WHERE id = $1 OR email = $2;', 1, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<T>;

  /**
   * Allows the running of a sequence of read/write operations that are guaranteed to either succeed or fail as a whole.
   * @example
   * ```
   * const [george, bob, alice] = await prisma.$transaction([
   *   prisma.user.create({ data: { name: 'George' } }),
   *   prisma.user.create({ data: { name: 'Bob' } }),
   *   prisma.user.create({ data: { name: 'Alice' } }),
   * ])
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/concepts/components/prisma-client/transactions).
   */
  $transaction<P extends Prisma.PrismaPromise<any>[]>(
    arg: [...P],
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
  ): $Utils.JsPromise<runtime.Types.Utils.UnwrapTuple<P>>;

  $transaction<R>(
    fn: (prisma: Omit<PrismaClient, runtime.ITXClientDenyList>) => $Utils.JsPromise<R>,
    options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
  ): $Utils.JsPromise<R>;

  $extends: $Extensions.ExtendsHook<
    'extends',
    Prisma.TypeMapCb<ClientOptions>,
    ExtArgs,
    $Utils.Call<
      Prisma.TypeMapCb<ClientOptions>,
      {
        extArgs: ExtArgs;
      }
    >
  >;

  /**
   * `prisma.admin`: Exposes CRUD operations for the **Admin** model.
   * Example usage:
   * ```ts
   * // Fetch zero or more Admins
   * const admins = await prisma.admin.findMany()
   * ```
   */
  get admin(): Prisma.AdminDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.viewerAuth`: Exposes CRUD operations for the **ViewerAuth** model.
   * Example usage:
   * ```ts
   * // Fetch zero or more ViewerAuths
   * const viewerAuths = await prisma.viewerAuth.findMany()
   * ```
   */
  get viewerAuth(): Prisma.ViewerAuthDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.skillSheet`: Exposes CRUD operations for the **SkillSheet** model.
   * Example usage:
   * ```ts
   * // Fetch zero or more SkillSheets
   * const skillSheets = await prisma.skillSheet.findMany()
   * ```
   */
  get skillSheet(): Prisma.SkillSheetDelegate<ExtArgs, ClientOptions>;
}

export namespace Prisma {
  export import DMMF = runtime.DMMF;

  export type PrismaPromise<T> = $Public.PrismaPromise<T>;

  /**
   * Validator
   */
  export import validator = runtime.Public.validator;

  /**
   * Prisma Errors
   */
  export import PrismaClientKnownRequestError = runtime.PrismaClientKnownRequestError;
  export import PrismaClientUnknownRequestError = runtime.PrismaClientUnknownRequestError;
  export import PrismaClientRustPanicError = runtime.PrismaClientRustPanicError;
  export import PrismaClientInitializationError = runtime.PrismaClientInitializationError;
  export import PrismaClientValidationError = runtime.PrismaClientValidationError;

  /**
   * Re-export of sql-template-tag
   */
  export import sql = runtime.sqltag;
  export import empty = runtime.empty;
  export import join = runtime.join;
  export import raw = runtime.raw;
  export import Sql = runtime.Sql;

  /**
   * Decimal.js
   */
  export import Decimal = runtime.Decimal;

  export type DecimalJsLike = runtime.DecimalJsLike;

  /**
   * Metrics
   */
  export type Metrics = runtime.Metrics;
  export type Metric<T> = runtime.Metric<T>;
  export type MetricHistogram = runtime.MetricHistogram;
  export type MetricHistogramBucket = runtime.MetricHistogramBucket;

  /**
   * Extensions
   */
  export import Extension = $Extensions.UserArgs;
  export import getExtensionContext = runtime.Extensions.getExtensionContext;
  export import Args = $Public.Args;
  export import Payload = $Public.Payload;
  export import Result = $Public.Result;
  export import Exact = $Public.Exact;

  /**
   * Prisma Client JS version: 6.19.0
   * Query Engine version: 2ba551f319ab1df4bc874a89965d8b3641056773
   */
  export type PrismaVersion = {
    client: string;
  };

  export const prismaVersion: PrismaVersion;

  /**
   * Utility Types
   */

  export import Bytes = runtime.Bytes;
  export import JsonObject = runtime.JsonObject;
  export import JsonArray = runtime.JsonArray;
  export import JsonValue = runtime.JsonValue;
  export import InputJsonObject = runtime.InputJsonObject;
  export import InputJsonArray = runtime.InputJsonArray;
  export import InputJsonValue = runtime.InputJsonValue;

  /**
   * Types of the values used to represent different kinds of `null` values when working with JSON fields.
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  namespace NullTypes {
    /**
     * Type of `Prisma.DbNull`.
     *
     * You cannot use other instances of this class. Please use the `Prisma.DbNull` value.
     *
     * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
     */
    class DbNull {
      private DbNull: never;
      private constructor();
    }

    /**
     * Type of `Prisma.JsonNull`.
     *
     * You cannot use other instances of this class. Please use the `Prisma.JsonNull` value.
     *
     * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
     */
    class JsonNull {
      private JsonNull: never;
      private constructor();
    }

    /**
     * Type of `Prisma.AnyNull`.
     *
     * You cannot use other instances of this class. Please use the `Prisma.AnyNull` value.
     *
     * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
     */
    class AnyNull {
      private AnyNull: never;
      private constructor();
    }
  }

  /**
   * Helper for filtering JSON entries that have `null` on the database (empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const DbNull: NullTypes.DbNull;

  /**
   * Helper for filtering JSON entries that have JSON `null` values (not empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const JsonNull: NullTypes.JsonNull;

  /**
   * Helper for filtering JSON entries that are `Prisma.DbNull` or `Prisma.JsonNull`
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const AnyNull: NullTypes.AnyNull;

  type SelectAndInclude = {
    select: any;
    include: any;
  };

  type SelectAndOmit = {
    select: any;
    omit: any;
  };

  /**
   * Get the type of the value, that the Promise holds.
   */
  export type PromiseType<T extends PromiseLike<any>> = T extends PromiseLike<infer U> ? U : T;

  /**
   * Get the return type of a function which returns a Promise.
   */
  export type PromiseReturnType<T extends (...args: any) => $Utils.JsPromise<any>> = PromiseType<ReturnType<T>>;

  /**
   * From T, pick a set of properties whose keys are in the union K
   */
  type Prisma__Pick<T, K extends keyof T> = {
    [P in K]: T[P];
  };

  export type Enumerable<T> = T | Array<T>;

  export type RequiredKeys<T> = {
    [K in keyof T]-?: {} extends Prisma__Pick<T, K> ? never : K;
  }[keyof T];

  export type TruthyKeys<T> = keyof {
    [K in keyof T as T[K] extends false | undefined | null ? never : K]: K;
  };

  export type TrueKeys<T> = TruthyKeys<Prisma__Pick<T, RequiredKeys<T>>>;

  /**
   * Subset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection
   */
  export type Subset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
  };

  /**
   * SelectSubset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection.
   * Additionally, it validates, if both select and include are present. If the case, it errors.
   */
  export type SelectSubset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
  } & (T extends SelectAndInclude
    ? 'Please either choose `select` or `include`.'
    : T extends SelectAndOmit
      ? 'Please either choose `select` or `omit`.'
      : {});

  /**
   * Subset + Intersection
   * @desc From `T` pick properties that exist in `U` and intersect `K`
   */
  export type SubsetIntersection<T, U, K> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
  } & K;

  type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

  /**
   * XOR is needed to have a real mutually exclusive union type
   * https://stackoverflow.com/questions/42123407/does-typescript-support-mutually-exclusive-types
   */
  type XOR<T, U> = T extends object ? (U extends object ? (Without<T, U> & U) | (Without<U, T> & T) : U) : T;

  /**
   * Is T a Record?
   */
  type IsObject<T extends any> =
    T extends Array<any>
      ? False
      : T extends Date
        ? False
        : T extends Uint8Array
          ? False
          : T extends BigInt
            ? False
            : T extends object
              ? True
              : False;

  /**
   * If it's T[], return T
   */
  export type UnEnumerate<T extends unknown> = T extends Array<infer U> ? U : T;

  /**
   * From ts-toolbelt
   */

  type __Either<O extends object, K extends Key> = Omit<O, K> &
    {
      // Merge all but K
      [P in K]: Prisma__Pick<O, P & keyof O>; // With K possibilities
    }[K];

  type EitherStrict<O extends object, K extends Key> = Strict<__Either<O, K>>;

  type EitherLoose<O extends object, K extends Key> = ComputeRaw<__Either<O, K>>;

  type _Either<O extends object, K extends Key, strict extends Boolean> = {
    1: EitherStrict<O, K>;
    0: EitherLoose<O, K>;
  }[strict];

  type Either<O extends object, K extends Key, strict extends Boolean = 1> = O extends unknown
    ? _Either<O, K, strict>
    : never;

  export type Union = any;

  type PatchUndefined<O extends object, O1 extends object> = {
    [K in keyof O]: O[K] extends undefined ? At<O1, K> : O[K];
  } & {};

  /** Helper Types for "Merge" **/
  export type IntersectOf<U extends Union> = (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void
    ? I
    : never;

  export type Overwrite<O extends object, O1 extends object> = {
    [K in keyof O]: K extends keyof O1 ? O1[K] : O[K];
  } & {};

  type _Merge<U extends object> = IntersectOf<
    Overwrite<
      U,
      {
        [K in keyof U]-?: At<U, K>;
      }
    >
  >;

  type Key = string | number | symbol;
  type AtBasic<O extends object, K extends Key> = K extends keyof O ? O[K] : never;
  type AtStrict<O extends object, K extends Key> = O[K & keyof O];
  type AtLoose<O extends object, K extends Key> = O extends unknown ? AtStrict<O, K> : never;
  export type At<O extends object, K extends Key, strict extends Boolean = 1> = {
    1: AtStrict<O, K>;
    0: AtLoose<O, K>;
  }[strict];

  export type ComputeRaw<A extends any> = A extends Function
    ? A
    : {
        [K in keyof A]: A[K];
      } & {};

  export type OptionalFlat<O> = {
    [K in keyof O]?: O[K];
  } & {};

  type _Record<K extends keyof any, T> = {
    [P in K]: T;
  };

  // cause typescript not to expand types and preserve names
  type NoExpand<T> = T extends unknown ? T : never;

  // this type assumes the passed object is entirely optional
  type AtLeast<O extends object, K extends string> = NoExpand<
    O extends unknown
      ? (K extends keyof O ? { [P in K]: O[P] } & O : O) | ({ [P in keyof O as P extends K ? P : never]-?: O[P] } & O)
      : never
  >;

  type _Strict<U, _U = U> = U extends unknown ? U & OptionalFlat<_Record<Exclude<Keys<_U>, keyof U>, never>> : never;

  export type Strict<U extends object> = ComputeRaw<_Strict<U>>;
  /** End Helper Types for "Merge" **/

  export type Merge<U extends object> = ComputeRaw<_Merge<Strict<U>>>;

  /**
  A [[Boolean]]
  */
  export type Boolean = True | False;

  // /**
  // 1
  // */
  export type True = 1;

  /**
  0
  */
  export type False = 0;

  export type Not<B extends Boolean> = {
    0: 1;
    1: 0;
  }[B];

  export type Extends<A1 extends any, A2 extends any> = [A1] extends [never]
    ? 0 // anything `never` is false
    : A1 extends A2
      ? 1
      : 0;

  export type Has<U extends Union, U1 extends Union> = Not<Extends<Exclude<U1, U>, U1>>;

  export type Or<B1 extends Boolean, B2 extends Boolean> = {
    0: {
      0: 0;
      1: 1;
    };
    1: {
      0: 1;
      1: 1;
    };
  }[B1][B2];

  export type Keys<U extends Union> = U extends unknown ? keyof U : never;

  type Cast<A, B> = A extends B ? A : B;

  export const type: unique symbol;

  /**
   * Used by group by
   */

  export type GetScalarType<T, O> = O extends object
    ? {
        [P in keyof T]: P extends keyof O ? O[P] : never;
      }
    : never;

  type FieldPaths<T, U = Omit<T, '_avg' | '_sum' | '_count' | '_min' | '_max'>> = IsObject<T> extends True ? U : T;

  type GetHavingFields<T> = {
    [K in keyof T]: Or<Or<Extends<'OR', K>, Extends<'AND', K>>, Extends<'NOT', K>> extends True
      ? // infer is only needed to not hit TS limit
        // based on the brilliant idea of Pierre-Antoine Mills
        // https://github.com/microsoft/TypeScript/issues/30188#issuecomment-478938437
        T[K] extends infer TK
        ? GetHavingFields<UnEnumerate<TK> extends object ? Merge<UnEnumerate<TK>> : never>
        : never
      : {} extends FieldPaths<T[K]>
        ? never
        : K;
  }[keyof T];

  /**
   * Convert tuple to union
   */
  type _TupleToUnion<T> = T extends (infer E)[] ? E : never;
  type TupleToUnion<K extends readonly any[]> = _TupleToUnion<K>;
  type MaybeTupleToUnion<T> = T extends any[] ? TupleToUnion<T> : T;

  /**
   * Like `Pick`, but additionally can also accept an array of keys
   */
  type PickEnumerable<T, K extends Enumerable<keyof T> | keyof T> = Prisma__Pick<T, MaybeTupleToUnion<K>>;

  /**
   * Exclude all keys with underscores
   */
  type ExcludeUnderscoreKeys<T extends string> = T extends `_${string}` ? never : T;

  export type FieldRef<Model, FieldType> = runtime.FieldRef<Model, FieldType>;

  type FieldRefInputType<Model, FieldType> = Model extends never ? never : FieldRef<Model, FieldType>;

  export const ModelName: {
    Admin: 'Admin';
    ViewerAuth: 'ViewerAuth';
    SkillSheet: 'SkillSheet';
  };

  export type ModelName = (typeof ModelName)[keyof typeof ModelName];

  export type Datasources = {
    db?: Datasource;
  };

  interface TypeMapCb<ClientOptions = {}>
    extends $Utils.Fn<{ extArgs: $Extensions.InternalArgs }, $Utils.Record<string, any>> {
    returns: Prisma.TypeMap<
      this['params']['extArgs'],
      ClientOptions extends { omit: infer OmitOptions } ? OmitOptions : {}
    >;
  }

  export type TypeMap<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> = {
    globalOmitOptions: {
      omit: GlobalOmitOptions;
    };
    meta: {
      modelProps: 'admin' | 'viewerAuth' | 'skillSheet';
      txIsolationLevel: Prisma.TransactionIsolationLevel;
    };
    model: {
      Admin: {
        payload: Prisma.$AdminPayload<ExtArgs>;
        fields: Prisma.AdminFieldRefs;
        operations: {
          findUnique: {
            args: Prisma.AdminFindUniqueArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$AdminPayload> | null;
          };
          findUniqueOrThrow: {
            args: Prisma.AdminFindUniqueOrThrowArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$AdminPayload>;
          };
          findFirst: {
            args: Prisma.AdminFindFirstArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$AdminPayload> | null;
          };
          findFirstOrThrow: {
            args: Prisma.AdminFindFirstOrThrowArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$AdminPayload>;
          };
          findMany: {
            args: Prisma.AdminFindManyArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$AdminPayload>[];
          };
          create: {
            args: Prisma.AdminCreateArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$AdminPayload>;
          };
          createMany: {
            args: Prisma.AdminCreateManyArgs<ExtArgs>;
            result: BatchPayload;
          };
          createManyAndReturn: {
            args: Prisma.AdminCreateManyAndReturnArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$AdminPayload>[];
          };
          delete: {
            args: Prisma.AdminDeleteArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$AdminPayload>;
          };
          update: {
            args: Prisma.AdminUpdateArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$AdminPayload>;
          };
          deleteMany: {
            args: Prisma.AdminDeleteManyArgs<ExtArgs>;
            result: BatchPayload;
          };
          updateMany: {
            args: Prisma.AdminUpdateManyArgs<ExtArgs>;
            result: BatchPayload;
          };
          updateManyAndReturn: {
            args: Prisma.AdminUpdateManyAndReturnArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$AdminPayload>[];
          };
          upsert: {
            args: Prisma.AdminUpsertArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$AdminPayload>;
          };
          aggregate: {
            args: Prisma.AdminAggregateArgs<ExtArgs>;
            result: $Utils.Optional<AggregateAdmin>;
          };
          groupBy: {
            args: Prisma.AdminGroupByArgs<ExtArgs>;
            result: $Utils.Optional<AdminGroupByOutputType>[];
          };
          count: {
            args: Prisma.AdminCountArgs<ExtArgs>;
            result: $Utils.Optional<AdminCountAggregateOutputType> | number;
          };
        };
      };
      ViewerAuth: {
        payload: Prisma.$ViewerAuthPayload<ExtArgs>;
        fields: Prisma.ViewerAuthFieldRefs;
        operations: {
          findUnique: {
            args: Prisma.ViewerAuthFindUniqueArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$ViewerAuthPayload> | null;
          };
          findUniqueOrThrow: {
            args: Prisma.ViewerAuthFindUniqueOrThrowArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$ViewerAuthPayload>;
          };
          findFirst: {
            args: Prisma.ViewerAuthFindFirstArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$ViewerAuthPayload> | null;
          };
          findFirstOrThrow: {
            args: Prisma.ViewerAuthFindFirstOrThrowArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$ViewerAuthPayload>;
          };
          findMany: {
            args: Prisma.ViewerAuthFindManyArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$ViewerAuthPayload>[];
          };
          create: {
            args: Prisma.ViewerAuthCreateArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$ViewerAuthPayload>;
          };
          createMany: {
            args: Prisma.ViewerAuthCreateManyArgs<ExtArgs>;
            result: BatchPayload;
          };
          createManyAndReturn: {
            args: Prisma.ViewerAuthCreateManyAndReturnArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$ViewerAuthPayload>[];
          };
          delete: {
            args: Prisma.ViewerAuthDeleteArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$ViewerAuthPayload>;
          };
          update: {
            args: Prisma.ViewerAuthUpdateArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$ViewerAuthPayload>;
          };
          deleteMany: {
            args: Prisma.ViewerAuthDeleteManyArgs<ExtArgs>;
            result: BatchPayload;
          };
          updateMany: {
            args: Prisma.ViewerAuthUpdateManyArgs<ExtArgs>;
            result: BatchPayload;
          };
          updateManyAndReturn: {
            args: Prisma.ViewerAuthUpdateManyAndReturnArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$ViewerAuthPayload>[];
          };
          upsert: {
            args: Prisma.ViewerAuthUpsertArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$ViewerAuthPayload>;
          };
          aggregate: {
            args: Prisma.ViewerAuthAggregateArgs<ExtArgs>;
            result: $Utils.Optional<AggregateViewerAuth>;
          };
          groupBy: {
            args: Prisma.ViewerAuthGroupByArgs<ExtArgs>;
            result: $Utils.Optional<ViewerAuthGroupByOutputType>[];
          };
          count: {
            args: Prisma.ViewerAuthCountArgs<ExtArgs>;
            result: $Utils.Optional<ViewerAuthCountAggregateOutputType> | number;
          };
        };
      };
      SkillSheet: {
        payload: Prisma.$SkillSheetPayload<ExtArgs>;
        fields: Prisma.SkillSheetFieldRefs;
        operations: {
          findUnique: {
            args: Prisma.SkillSheetFindUniqueArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$SkillSheetPayload> | null;
          };
          findUniqueOrThrow: {
            args: Prisma.SkillSheetFindUniqueOrThrowArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$SkillSheetPayload>;
          };
          findFirst: {
            args: Prisma.SkillSheetFindFirstArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$SkillSheetPayload> | null;
          };
          findFirstOrThrow: {
            args: Prisma.SkillSheetFindFirstOrThrowArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$SkillSheetPayload>;
          };
          findMany: {
            args: Prisma.SkillSheetFindManyArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$SkillSheetPayload>[];
          };
          create: {
            args: Prisma.SkillSheetCreateArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$SkillSheetPayload>;
          };
          createMany: {
            args: Prisma.SkillSheetCreateManyArgs<ExtArgs>;
            result: BatchPayload;
          };
          createManyAndReturn: {
            args: Prisma.SkillSheetCreateManyAndReturnArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$SkillSheetPayload>[];
          };
          delete: {
            args: Prisma.SkillSheetDeleteArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$SkillSheetPayload>;
          };
          update: {
            args: Prisma.SkillSheetUpdateArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$SkillSheetPayload>;
          };
          deleteMany: {
            args: Prisma.SkillSheetDeleteManyArgs<ExtArgs>;
            result: BatchPayload;
          };
          updateMany: {
            args: Prisma.SkillSheetUpdateManyArgs<ExtArgs>;
            result: BatchPayload;
          };
          updateManyAndReturn: {
            args: Prisma.SkillSheetUpdateManyAndReturnArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$SkillSheetPayload>[];
          };
          upsert: {
            args: Prisma.SkillSheetUpsertArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$SkillSheetPayload>;
          };
          aggregate: {
            args: Prisma.SkillSheetAggregateArgs<ExtArgs>;
            result: $Utils.Optional<AggregateSkillSheet>;
          };
          groupBy: {
            args: Prisma.SkillSheetGroupByArgs<ExtArgs>;
            result: $Utils.Optional<SkillSheetGroupByOutputType>[];
          };
          count: {
            args: Prisma.SkillSheetCountArgs<ExtArgs>;
            result: $Utils.Optional<SkillSheetCountAggregateOutputType> | number;
          };
        };
      };
    };
  } & {
    other: {
      payload: any;
      operations: {
        $executeRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]];
          result: any;
        };
        $executeRawUnsafe: {
          args: [query: string, ...values: any[]];
          result: any;
        };
        $queryRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]];
          result: any;
        };
        $queryRawUnsafe: {
          args: [query: string, ...values: any[]];
          result: any;
        };
      };
    };
  };
  export const defineExtension: $Extensions.ExtendsHook<'define', Prisma.TypeMapCb, $Extensions.DefaultArgs>;
  export type DefaultPrismaClient = PrismaClient;
  export type ErrorFormat = 'pretty' | 'colorless' | 'minimal';
  export interface PrismaClientOptions {
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasources?: Datasources;
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasourceUrl?: string;
    /**
     * @default "colorless"
     */
    errorFormat?: ErrorFormat;
    /**
     * @example
     * ```
     * // Shorthand for `emit: 'stdout'`
     * log: ['query', 'info', 'warn', 'error']
     *
     * // Emit as events only
     * log: [
     *   { emit: 'event', level: 'query' },
     *   { emit: 'event', level: 'info' },
     *   { emit: 'event', level: 'warn' }
     *   { emit: 'event', level: 'error' }
     * ]
     *
     * / Emit as events and log to stdout
     * og: [
     *  { emit: 'stdout', level: 'query' },
     *  { emit: 'stdout', level: 'info' },
     *  { emit: 'stdout', level: 'warn' }
     *  { emit: 'stdout', level: 'error' }
     *
     * ```
     * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/logging#the-log-option).
     */
    log?: (LogLevel | LogDefinition)[];
    /**
     * The default values for transactionOptions
     * maxWait ?= 2000
     * timeout ?= 5000
     */
    transactionOptions?: {
      maxWait?: number;
      timeout?: number;
      isolationLevel?: Prisma.TransactionIsolationLevel;
    };
    /**
     * Instance of a Driver Adapter, e.g., like one provided by `@prisma/adapter-planetscale`
     */
    adapter?: runtime.SqlDriverAdapterFactory | null;
    /**
     * Global configuration for omitting model fields by default.
     *
     * @example
     * ```
     * const prisma = new PrismaClient({
     *   omit: {
     *     user: {
     *       password: true
     *     }
     *   }
     * })
     * ```
     */
    omit?: Prisma.GlobalOmitConfig;
  }
  export type GlobalOmitConfig = {
    admin?: AdminOmit;
    viewerAuth?: ViewerAuthOmit;
    skillSheet?: SkillSheetOmit;
  };

  /* Types for Logging */
  export type LogLevel = 'info' | 'query' | 'warn' | 'error';
  export type LogDefinition = {
    level: LogLevel;
    emit: 'stdout' | 'event';
  };

  export type CheckIsLogLevel<T> = T extends LogLevel ? T : never;

  export type GetLogType<T> = CheckIsLogLevel<T extends LogDefinition ? T['level'] : T>;

  export type GetEvents<T extends any[]> = T extends Array<LogLevel | LogDefinition> ? GetLogType<T[number]> : never;

  export type QueryEvent = {
    timestamp: Date;
    query: string;
    params: string;
    duration: number;
    target: string;
  };

  export type LogEvent = {
    timestamp: Date;
    message: string;
    target: string;
  };
  /* End Types for Logging */

  export type PrismaAction =
    | 'findUnique'
    | 'findUniqueOrThrow'
    | 'findMany'
    | 'findFirst'
    | 'findFirstOrThrow'
    | 'create'
    | 'createMany'
    | 'createManyAndReturn'
    | 'update'
    | 'updateMany'
    | 'updateManyAndReturn'
    | 'upsert'
    | 'delete'
    | 'deleteMany'
    | 'executeRaw'
    | 'queryRaw'
    | 'aggregate'
    | 'count'
    | 'runCommandRaw'
    | 'findRaw'
    | 'groupBy';

  // tested in getLogLevel.test.ts
  export function getLogLevel(log: Array<LogLevel | LogDefinition>): LogLevel | undefined;

  /**
   * `PrismaClient` proxy available in interactive transactions.
   */
  export type TransactionClient = Omit<Prisma.DefaultPrismaClient, runtime.ITXClientDenyList>;

  export type Datasource = {
    url?: string;
  };

  /**
   * Count Types
   */

  /**
   * Models
   */

  /**
   * Model Admin
   */

  export type AggregateAdmin = {
    _count: AdminCountAggregateOutputType | null;
    _min: AdminMinAggregateOutputType | null;
    _max: AdminMaxAggregateOutputType | null;
  };

  export type AdminMinAggregateOutputType = {
    id: string | null;
    username: string | null;
    password: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
  };

  export type AdminMaxAggregateOutputType = {
    id: string | null;
    username: string | null;
    password: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
  };

  export type AdminCountAggregateOutputType = {
    id: number;
    username: number;
    password: number;
    createdAt: number;
    updatedAt: number;
    _all: number;
  };

  export type AdminMinAggregateInputType = {
    id?: true;
    username?: true;
    password?: true;
    createdAt?: true;
    updatedAt?: true;
  };

  export type AdminMaxAggregateInputType = {
    id?: true;
    username?: true;
    password?: true;
    createdAt?: true;
    updatedAt?: true;
  };

  export type AdminCountAggregateInputType = {
    id?: true;
    username?: true;
    password?: true;
    createdAt?: true;
    updatedAt?: true;
    _all?: true;
  };

  export type AdminAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Admin to aggregate.
     */
    where?: AdminWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Admins to fetch.
     */
    orderBy?: AdminOrderByWithRelationInput | AdminOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the start position
     */
    cursor?: AdminWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Admins from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Admins.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Count returned Admins
     **/
    _count?: true | AdminCountAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the minimum value
     **/
    _min?: AdminMinAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the maximum value
     **/
    _max?: AdminMaxAggregateInputType;
  };

  export type GetAdminAggregateType<T extends AdminAggregateArgs> = {
    [P in keyof T & keyof AggregateAdmin]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateAdmin[P]>
      : GetScalarType<T[P], AggregateAdmin[P]>;
  };

  export type AdminGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: AdminWhereInput;
    orderBy?: AdminOrderByWithAggregationInput | AdminOrderByWithAggregationInput[];
    by: AdminScalarFieldEnum[] | AdminScalarFieldEnum;
    having?: AdminScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: AdminCountAggregateInputType | true;
    _min?: AdminMinAggregateInputType;
    _max?: AdminMaxAggregateInputType;
  };

  export type AdminGroupByOutputType = {
    id: string;
    username: string;
    password: string;
    createdAt: Date;
    updatedAt: Date;
    _count: AdminCountAggregateOutputType | null;
    _min: AdminMinAggregateOutputType | null;
    _max: AdminMaxAggregateOutputType | null;
  };

  type GetAdminGroupByPayload<T extends AdminGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<AdminGroupByOutputType, T['by']> & {
        [P in keyof T & keyof AdminGroupByOutputType]: P extends '_count'
          ? T[P] extends boolean
            ? number
            : GetScalarType<T[P], AdminGroupByOutputType[P]>
          : GetScalarType<T[P], AdminGroupByOutputType[P]>;
      }
    >
  >;

  export type AdminSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<
    {
      id?: boolean;
      username?: boolean;
      password?: boolean;
      createdAt?: boolean;
      updatedAt?: boolean;
    },
    ExtArgs['result']['admin']
  >;

  export type AdminSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    $Extensions.GetSelect<
      {
        id?: boolean;
        username?: boolean;
        password?: boolean;
        createdAt?: boolean;
        updatedAt?: boolean;
      },
      ExtArgs['result']['admin']
    >;

  export type AdminSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    $Extensions.GetSelect<
      {
        id?: boolean;
        username?: boolean;
        password?: boolean;
        createdAt?: boolean;
        updatedAt?: boolean;
      },
      ExtArgs['result']['admin']
    >;

  export type AdminSelectScalar = {
    id?: boolean;
    username?: boolean;
    password?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
  };

  export type AdminOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<
    'id' | 'username' | 'password' | 'createdAt' | 'updatedAt',
    ExtArgs['result']['admin']
  >;

  export type $AdminPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: 'Admin';
    objects: {};
    scalars: $Extensions.GetPayloadResult<
      {
        id: string;
        username: string;
        password: string;
        createdAt: Date;
        updatedAt: Date;
      },
      ExtArgs['result']['admin']
    >;
    composites: {};
  };

  type AdminGetPayload<S extends boolean | null | undefined | AdminDefaultArgs> = $Result.GetResult<
    Prisma.$AdminPayload,
    S
  >;

  type AdminCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = Omit<
    AdminFindManyArgs,
    'select' | 'include' | 'distinct' | 'omit'
  > & {
    select?: AdminCountAggregateInputType | true;
  };

  export interface AdminDelegate<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
    GlobalOmitOptions = {},
  > {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Admin']; meta: { name: 'Admin' } };
    /**
     * Find zero or one Admin that matches the filter.
     * @param {AdminFindUniqueArgs} args - Arguments to find a Admin
     * @example
     * // Get one Admin
     * const admin = await prisma.admin.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends AdminFindUniqueArgs>(
      args: SelectSubset<T, AdminFindUniqueArgs<ExtArgs>>,
    ): Prisma__AdminClient<
      $Result.GetResult<Prisma.$AdminPayload<ExtArgs>, T, 'findUnique', GlobalOmitOptions> | null,
      null,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Find one Admin that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {AdminFindUniqueOrThrowArgs} args - Arguments to find a Admin
     * @example
     * // Get one Admin
     * const admin = await prisma.admin.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends AdminFindUniqueOrThrowArgs>(
      args: SelectSubset<T, AdminFindUniqueOrThrowArgs<ExtArgs>>,
    ): Prisma__AdminClient<
      $Result.GetResult<Prisma.$AdminPayload<ExtArgs>, T, 'findUniqueOrThrow', GlobalOmitOptions>,
      never,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Find the first Admin that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AdminFindFirstArgs} args - Arguments to find a Admin
     * @example
     * // Get one Admin
     * const admin = await prisma.admin.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends AdminFindFirstArgs>(
      args?: SelectSubset<T, AdminFindFirstArgs<ExtArgs>>,
    ): Prisma__AdminClient<
      $Result.GetResult<Prisma.$AdminPayload<ExtArgs>, T, 'findFirst', GlobalOmitOptions> | null,
      null,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Find the first Admin that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AdminFindFirstOrThrowArgs} args - Arguments to find a Admin
     * @example
     * // Get one Admin
     * const admin = await prisma.admin.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends AdminFindFirstOrThrowArgs>(
      args?: SelectSubset<T, AdminFindFirstOrThrowArgs<ExtArgs>>,
    ): Prisma__AdminClient<
      $Result.GetResult<Prisma.$AdminPayload<ExtArgs>, T, 'findFirstOrThrow', GlobalOmitOptions>,
      never,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Find zero or more Admins that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AdminFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Admins
     * const admins = await prisma.admin.findMany()
     *
     * // Get first 10 Admins
     * const admins = await prisma.admin.findMany({ take: 10 })
     *
     * // Only select the `id`
     * const adminWithIdOnly = await prisma.admin.findMany({ select: { id: true } })
     *
     */
    findMany<T extends AdminFindManyArgs>(
      args?: SelectSubset<T, AdminFindManyArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AdminPayload<ExtArgs>, T, 'findMany', GlobalOmitOptions>>;

    /**
     * Create a Admin.
     * @param {AdminCreateArgs} args - Arguments to create a Admin.
     * @example
     * // Create one Admin
     * const Admin = await prisma.admin.create({
     *   data: {
     *     // ... data to create a Admin
     *   }
     * })
     *
     */
    create<T extends AdminCreateArgs>(
      args: SelectSubset<T, AdminCreateArgs<ExtArgs>>,
    ): Prisma__AdminClient<
      $Result.GetResult<Prisma.$AdminPayload<ExtArgs>, T, 'create', GlobalOmitOptions>,
      never,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Create many Admins.
     * @param {AdminCreateManyArgs} args - Arguments to create many Admins.
     * @example
     * // Create many Admins
     * const admin = await prisma.admin.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     */
    createMany<T extends AdminCreateManyArgs>(
      args?: SelectSubset<T, AdminCreateManyArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<BatchPayload>;

    /**
     * Create many Admins and returns the data saved in the database.
     * @param {AdminCreateManyAndReturnArgs} args - Arguments to create many Admins.
     * @example
     * // Create many Admins
     * const admin = await prisma.admin.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Create many Admins and only return the `id`
     * const adminWithIdOnly = await prisma.admin.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    createManyAndReturn<T extends AdminCreateManyAndReturnArgs>(
      args?: SelectSubset<T, AdminCreateManyAndReturnArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<
      $Result.GetResult<Prisma.$AdminPayload<ExtArgs>, T, 'createManyAndReturn', GlobalOmitOptions>
    >;

    /**
     * Delete a Admin.
     * @param {AdminDeleteArgs} args - Arguments to delete one Admin.
     * @example
     * // Delete one Admin
     * const Admin = await prisma.admin.delete({
     *   where: {
     *     // ... filter to delete one Admin
     *   }
     * })
     *
     */
    delete<T extends AdminDeleteArgs>(
      args: SelectSubset<T, AdminDeleteArgs<ExtArgs>>,
    ): Prisma__AdminClient<
      $Result.GetResult<Prisma.$AdminPayload<ExtArgs>, T, 'delete', GlobalOmitOptions>,
      never,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Update one Admin.
     * @param {AdminUpdateArgs} args - Arguments to update one Admin.
     * @example
     * // Update one Admin
     * const admin = await prisma.admin.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    update<T extends AdminUpdateArgs>(
      args: SelectSubset<T, AdminUpdateArgs<ExtArgs>>,
    ): Prisma__AdminClient<
      $Result.GetResult<Prisma.$AdminPayload<ExtArgs>, T, 'update', GlobalOmitOptions>,
      never,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Delete zero or more Admins.
     * @param {AdminDeleteManyArgs} args - Arguments to filter Admins to delete.
     * @example
     * // Delete a few Admins
     * const { count } = await prisma.admin.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     *
     */
    deleteMany<T extends AdminDeleteManyArgs>(
      args?: SelectSubset<T, AdminDeleteManyArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<BatchPayload>;

    /**
     * Update zero or more Admins.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AdminUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Admins
     * const admin = await prisma.admin.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    updateMany<T extends AdminUpdateManyArgs>(
      args: SelectSubset<T, AdminUpdateManyArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<BatchPayload>;

    /**
     * Update zero or more Admins and returns the data updated in the database.
     * @param {AdminUpdateManyAndReturnArgs} args - Arguments to update many Admins.
     * @example
     * // Update many Admins
     * const admin = await prisma.admin.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Update zero or more Admins and only return the `id`
     * const adminWithIdOnly = await prisma.admin.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    updateManyAndReturn<T extends AdminUpdateManyAndReturnArgs>(
      args: SelectSubset<T, AdminUpdateManyAndReturnArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<
      $Result.GetResult<Prisma.$AdminPayload<ExtArgs>, T, 'updateManyAndReturn', GlobalOmitOptions>
    >;

    /**
     * Create or update one Admin.
     * @param {AdminUpsertArgs} args - Arguments to update or create a Admin.
     * @example
     * // Update or create a Admin
     * const admin = await prisma.admin.upsert({
     *   create: {
     *     // ... data to create a Admin
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Admin we want to update
     *   }
     * })
     */
    upsert<T extends AdminUpsertArgs>(
      args: SelectSubset<T, AdminUpsertArgs<ExtArgs>>,
    ): Prisma__AdminClient<
      $Result.GetResult<Prisma.$AdminPayload<ExtArgs>, T, 'upsert', GlobalOmitOptions>,
      never,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Count the number of Admins.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AdminCountArgs} args - Arguments to filter Admins to count.
     * @example
     * // Count the number of Admins
     * const count = await prisma.admin.count({
     *   where: {
     *     // ... the filter for the Admins we want to count
     *   }
     * })
     **/
    count<T extends AdminCountArgs>(
      args?: Subset<T, AdminCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], AdminCountAggregateOutputType>
        : number
    >;

    /**
     * Allows you to perform aggregations operations on a Admin.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AdminAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
     **/
    aggregate<T extends AdminAggregateArgs>(
      args: Subset<T, AdminAggregateArgs>,
    ): Prisma.PrismaPromise<GetAdminAggregateType<T>>;

    /**
     * Group by Admin.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AdminGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     *
     **/
    groupBy<
      T extends AdminGroupByArgs,
      HasSelectOrTake extends Or<Extends<'skip', Keys<T>>, Extends<'take', Keys<T>>>,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: AdminGroupByArgs['orderBy'] }
        : { orderBy?: AdminGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
        ? `Error: "by" must not be empty.`
        : HavingValid extends False
          ? {
              [P in HavingFields]: P extends ByFields
                ? never
                : P extends string
                  ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
                  : [Error, 'Field ', P, ` in "having" needs to be provided in "by"`];
            }[HavingFields]
          : 'take' extends Keys<T>
            ? 'orderBy' extends Keys<T>
              ? ByValid extends True
                ? {}
                : {
                    [P in OrderFields]: P extends ByFields
                      ? never
                      : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
                  }[OrderFields]
              : 'Error: If you provide "take", you also need to provide "orderBy"'
            : 'skip' extends Keys<T>
              ? 'orderBy' extends Keys<T>
                ? ByValid extends True
                  ? {}
                  : {
                      [P in OrderFields]: P extends ByFields
                        ? never
                        : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
                    }[OrderFields]
                : 'Error: If you provide "skip", you also need to provide "orderBy"'
              : ByValid extends True
                ? {}
                : {
                    [P in OrderFields]: P extends ByFields
                      ? never
                      : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
                  }[OrderFields],
    >(
      args: SubsetIntersection<T, AdminGroupByArgs, OrderByArg> & InputErrors,
    ): {} extends InputErrors ? GetAdminGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>;
    /**
     * Fields of the Admin model
     */
    readonly fields: AdminFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Admin.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__AdminClient<
    T,
    Null = never,
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
    GlobalOmitOptions = {},
  > extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: 'PrismaPromise';
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(
      onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null,
      onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null,
    ): $Utils.JsPromise<TResult1 | TResult2>;
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(
      onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null,
    ): $Utils.JsPromise<T | TResult>;
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>;
  }

  /**
   * Fields of the Admin model
   */
  interface AdminFieldRefs {
    readonly id: FieldRef<'Admin', 'String'>;
    readonly username: FieldRef<'Admin', 'String'>;
    readonly password: FieldRef<'Admin', 'String'>;
    readonly createdAt: FieldRef<'Admin', 'DateTime'>;
    readonly updatedAt: FieldRef<'Admin', 'DateTime'>;
  }

  // Custom InputTypes
  /**
   * Admin findUnique
   */
  export type AdminFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Admin
     */
    select?: AdminSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Admin
     */
    omit?: AdminOmit<ExtArgs> | null;
    /**
     * Filter, which Admin to fetch.
     */
    where: AdminWhereUniqueInput;
  };

  /**
   * Admin findUniqueOrThrow
   */
  export type AdminFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Admin
     */
    select?: AdminSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Admin
     */
    omit?: AdminOmit<ExtArgs> | null;
    /**
     * Filter, which Admin to fetch.
     */
    where: AdminWhereUniqueInput;
  };

  /**
   * Admin findFirst
   */
  export type AdminFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Admin
     */
    select?: AdminSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Admin
     */
    omit?: AdminOmit<ExtArgs> | null;
    /**
     * Filter, which Admin to fetch.
     */
    where?: AdminWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Admins to fetch.
     */
    orderBy?: AdminOrderByWithRelationInput | AdminOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for Admins.
     */
    cursor?: AdminWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Admins from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Admins.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Admins.
     */
    distinct?: AdminScalarFieldEnum | AdminScalarFieldEnum[];
  };

  /**
   * Admin findFirstOrThrow
   */
  export type AdminFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Admin
     */
    select?: AdminSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Admin
     */
    omit?: AdminOmit<ExtArgs> | null;
    /**
     * Filter, which Admin to fetch.
     */
    where?: AdminWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Admins to fetch.
     */
    orderBy?: AdminOrderByWithRelationInput | AdminOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for Admins.
     */
    cursor?: AdminWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Admins from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Admins.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Admins.
     */
    distinct?: AdminScalarFieldEnum | AdminScalarFieldEnum[];
  };

  /**
   * Admin findMany
   */
  export type AdminFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Admin
     */
    select?: AdminSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Admin
     */
    omit?: AdminOmit<ExtArgs> | null;
    /**
     * Filter, which Admins to fetch.
     */
    where?: AdminWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Admins to fetch.
     */
    orderBy?: AdminOrderByWithRelationInput | AdminOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for listing Admins.
     */
    cursor?: AdminWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Admins from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Admins.
     */
    skip?: number;
    distinct?: AdminScalarFieldEnum | AdminScalarFieldEnum[];
  };

  /**
   * Admin create
   */
  export type AdminCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Admin
     */
    select?: AdminSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Admin
     */
    omit?: AdminOmit<ExtArgs> | null;
    /**
     * The data needed to create a Admin.
     */
    data: XOR<AdminCreateInput, AdminUncheckedCreateInput>;
  };

  /**
   * Admin createMany
   */
  export type AdminCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Admins.
     */
    data: AdminCreateManyInput | AdminCreateManyInput[];
    skipDuplicates?: boolean;
  };

  /**
   * Admin createManyAndReturn
   */
  export type AdminCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Admin
     */
    select?: AdminSelectCreateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the Admin
     */
    omit?: AdminOmit<ExtArgs> | null;
    /**
     * The data used to create many Admins.
     */
    data: AdminCreateManyInput | AdminCreateManyInput[];
    skipDuplicates?: boolean;
  };

  /**
   * Admin update
   */
  export type AdminUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Admin
     */
    select?: AdminSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Admin
     */
    omit?: AdminOmit<ExtArgs> | null;
    /**
     * The data needed to update a Admin.
     */
    data: XOR<AdminUpdateInput, AdminUncheckedUpdateInput>;
    /**
     * Choose, which Admin to update.
     */
    where: AdminWhereUniqueInput;
  };

  /**
   * Admin updateMany
   */
  export type AdminUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Admins.
     */
    data: XOR<AdminUpdateManyMutationInput, AdminUncheckedUpdateManyInput>;
    /**
     * Filter which Admins to update
     */
    where?: AdminWhereInput;
    /**
     * Limit how many Admins to update.
     */
    limit?: number;
  };

  /**
   * Admin updateManyAndReturn
   */
  export type AdminUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Admin
     */
    select?: AdminSelectUpdateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the Admin
     */
    omit?: AdminOmit<ExtArgs> | null;
    /**
     * The data used to update Admins.
     */
    data: XOR<AdminUpdateManyMutationInput, AdminUncheckedUpdateManyInput>;
    /**
     * Filter which Admins to update
     */
    where?: AdminWhereInput;
    /**
     * Limit how many Admins to update.
     */
    limit?: number;
  };

  /**
   * Admin upsert
   */
  export type AdminUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Admin
     */
    select?: AdminSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Admin
     */
    omit?: AdminOmit<ExtArgs> | null;
    /**
     * The filter to search for the Admin to update in case it exists.
     */
    where: AdminWhereUniqueInput;
    /**
     * In case the Admin found by the `where` argument doesn't exist, create a new Admin with this data.
     */
    create: XOR<AdminCreateInput, AdminUncheckedCreateInput>;
    /**
     * In case the Admin was found with the provided `where` argument, update it with this data.
     */
    update: XOR<AdminUpdateInput, AdminUncheckedUpdateInput>;
  };

  /**
   * Admin delete
   */
  export type AdminDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Admin
     */
    select?: AdminSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Admin
     */
    omit?: AdminOmit<ExtArgs> | null;
    /**
     * Filter which Admin to delete.
     */
    where: AdminWhereUniqueInput;
  };

  /**
   * Admin deleteMany
   */
  export type AdminDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Admins to delete
     */
    where?: AdminWhereInput;
    /**
     * Limit how many Admins to delete.
     */
    limit?: number;
  };

  /**
   * Admin without action
   */
  export type AdminDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Admin
     */
    select?: AdminSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Admin
     */
    omit?: AdminOmit<ExtArgs> | null;
  };

  /**
   * Model ViewerAuth
   */

  export type AggregateViewerAuth = {
    _count: ViewerAuthCountAggregateOutputType | null;
    _min: ViewerAuthMinAggregateOutputType | null;
    _max: ViewerAuthMaxAggregateOutputType | null;
  };

  export type ViewerAuthMinAggregateOutputType = {
    id: string | null;
    code: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
  };

  export type ViewerAuthMaxAggregateOutputType = {
    id: string | null;
    code: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
  };

  export type ViewerAuthCountAggregateOutputType = {
    id: number;
    code: number;
    createdAt: number;
    updatedAt: number;
    _all: number;
  };

  export type ViewerAuthMinAggregateInputType = {
    id?: true;
    code?: true;
    createdAt?: true;
    updatedAt?: true;
  };

  export type ViewerAuthMaxAggregateInputType = {
    id?: true;
    code?: true;
    createdAt?: true;
    updatedAt?: true;
  };

  export type ViewerAuthCountAggregateInputType = {
    id?: true;
    code?: true;
    createdAt?: true;
    updatedAt?: true;
    _all?: true;
  };

  export type ViewerAuthAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which ViewerAuth to aggregate.
     */
    where?: ViewerAuthWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of ViewerAuths to fetch.
     */
    orderBy?: ViewerAuthOrderByWithRelationInput | ViewerAuthOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the start position
     */
    cursor?: ViewerAuthWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` ViewerAuths from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` ViewerAuths.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Count returned ViewerAuths
     **/
    _count?: true | ViewerAuthCountAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the minimum value
     **/
    _min?: ViewerAuthMinAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the maximum value
     **/
    _max?: ViewerAuthMaxAggregateInputType;
  };

  export type GetViewerAuthAggregateType<T extends ViewerAuthAggregateArgs> = {
    [P in keyof T & keyof AggregateViewerAuth]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateViewerAuth[P]>
      : GetScalarType<T[P], AggregateViewerAuth[P]>;
  };

  export type ViewerAuthGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ViewerAuthWhereInput;
    orderBy?: ViewerAuthOrderByWithAggregationInput | ViewerAuthOrderByWithAggregationInput[];
    by: ViewerAuthScalarFieldEnum[] | ViewerAuthScalarFieldEnum;
    having?: ViewerAuthScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: ViewerAuthCountAggregateInputType | true;
    _min?: ViewerAuthMinAggregateInputType;
    _max?: ViewerAuthMaxAggregateInputType;
  };

  export type ViewerAuthGroupByOutputType = {
    id: string;
    code: string;
    createdAt: Date;
    updatedAt: Date;
    _count: ViewerAuthCountAggregateOutputType | null;
    _min: ViewerAuthMinAggregateOutputType | null;
    _max: ViewerAuthMaxAggregateOutputType | null;
  };

  type GetViewerAuthGroupByPayload<T extends ViewerAuthGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<ViewerAuthGroupByOutputType, T['by']> & {
        [P in keyof T & keyof ViewerAuthGroupByOutputType]: P extends '_count'
          ? T[P] extends boolean
            ? number
            : GetScalarType<T[P], ViewerAuthGroupByOutputType[P]>
          : GetScalarType<T[P], ViewerAuthGroupByOutputType[P]>;
      }
    >
  >;

  export type ViewerAuthSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    $Extensions.GetSelect<
      {
        id?: boolean;
        code?: boolean;
        createdAt?: boolean;
        updatedAt?: boolean;
      },
      ExtArgs['result']['viewerAuth']
    >;

  export type ViewerAuthSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    $Extensions.GetSelect<
      {
        id?: boolean;
        code?: boolean;
        createdAt?: boolean;
        updatedAt?: boolean;
      },
      ExtArgs['result']['viewerAuth']
    >;

  export type ViewerAuthSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    $Extensions.GetSelect<
      {
        id?: boolean;
        code?: boolean;
        createdAt?: boolean;
        updatedAt?: boolean;
      },
      ExtArgs['result']['viewerAuth']
    >;

  export type ViewerAuthSelectScalar = {
    id?: boolean;
    code?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
  };

  export type ViewerAuthOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<
    'id' | 'code' | 'createdAt' | 'updatedAt',
    ExtArgs['result']['viewerAuth']
  >;

  export type $ViewerAuthPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: 'ViewerAuth';
    objects: {};
    scalars: $Extensions.GetPayloadResult<
      {
        id: string;
        code: string;
        createdAt: Date;
        updatedAt: Date;
      },
      ExtArgs['result']['viewerAuth']
    >;
    composites: {};
  };

  type ViewerAuthGetPayload<S extends boolean | null | undefined | ViewerAuthDefaultArgs> = $Result.GetResult<
    Prisma.$ViewerAuthPayload,
    S
  >;

  type ViewerAuthCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = Omit<
    ViewerAuthFindManyArgs,
    'select' | 'include' | 'distinct' | 'omit'
  > & {
    select?: ViewerAuthCountAggregateInputType | true;
  };

  export interface ViewerAuthDelegate<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
    GlobalOmitOptions = {},
  > {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['ViewerAuth']; meta: { name: 'ViewerAuth' } };
    /**
     * Find zero or one ViewerAuth that matches the filter.
     * @param {ViewerAuthFindUniqueArgs} args - Arguments to find a ViewerAuth
     * @example
     * // Get one ViewerAuth
     * const viewerAuth = await prisma.viewerAuth.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends ViewerAuthFindUniqueArgs>(
      args: SelectSubset<T, ViewerAuthFindUniqueArgs<ExtArgs>>,
    ): Prisma__ViewerAuthClient<
      $Result.GetResult<Prisma.$ViewerAuthPayload<ExtArgs>, T, 'findUnique', GlobalOmitOptions> | null,
      null,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Find one ViewerAuth that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {ViewerAuthFindUniqueOrThrowArgs} args - Arguments to find a ViewerAuth
     * @example
     * // Get one ViewerAuth
     * const viewerAuth = await prisma.viewerAuth.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends ViewerAuthFindUniqueOrThrowArgs>(
      args: SelectSubset<T, ViewerAuthFindUniqueOrThrowArgs<ExtArgs>>,
    ): Prisma__ViewerAuthClient<
      $Result.GetResult<Prisma.$ViewerAuthPayload<ExtArgs>, T, 'findUniqueOrThrow', GlobalOmitOptions>,
      never,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Find the first ViewerAuth that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ViewerAuthFindFirstArgs} args - Arguments to find a ViewerAuth
     * @example
     * // Get one ViewerAuth
     * const viewerAuth = await prisma.viewerAuth.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends ViewerAuthFindFirstArgs>(
      args?: SelectSubset<T, ViewerAuthFindFirstArgs<ExtArgs>>,
    ): Prisma__ViewerAuthClient<
      $Result.GetResult<Prisma.$ViewerAuthPayload<ExtArgs>, T, 'findFirst', GlobalOmitOptions> | null,
      null,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Find the first ViewerAuth that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ViewerAuthFindFirstOrThrowArgs} args - Arguments to find a ViewerAuth
     * @example
     * // Get one ViewerAuth
     * const viewerAuth = await prisma.viewerAuth.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends ViewerAuthFindFirstOrThrowArgs>(
      args?: SelectSubset<T, ViewerAuthFindFirstOrThrowArgs<ExtArgs>>,
    ): Prisma__ViewerAuthClient<
      $Result.GetResult<Prisma.$ViewerAuthPayload<ExtArgs>, T, 'findFirstOrThrow', GlobalOmitOptions>,
      never,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Find zero or more ViewerAuths that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ViewerAuthFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all ViewerAuths
     * const viewerAuths = await prisma.viewerAuth.findMany()
     *
     * // Get first 10 ViewerAuths
     * const viewerAuths = await prisma.viewerAuth.findMany({ take: 10 })
     *
     * // Only select the `id`
     * const viewerAuthWithIdOnly = await prisma.viewerAuth.findMany({ select: { id: true } })
     *
     */
    findMany<T extends ViewerAuthFindManyArgs>(
      args?: SelectSubset<T, ViewerAuthFindManyArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ViewerAuthPayload<ExtArgs>, T, 'findMany', GlobalOmitOptions>>;

    /**
     * Create a ViewerAuth.
     * @param {ViewerAuthCreateArgs} args - Arguments to create a ViewerAuth.
     * @example
     * // Create one ViewerAuth
     * const ViewerAuth = await prisma.viewerAuth.create({
     *   data: {
     *     // ... data to create a ViewerAuth
     *   }
     * })
     *
     */
    create<T extends ViewerAuthCreateArgs>(
      args: SelectSubset<T, ViewerAuthCreateArgs<ExtArgs>>,
    ): Prisma__ViewerAuthClient<
      $Result.GetResult<Prisma.$ViewerAuthPayload<ExtArgs>, T, 'create', GlobalOmitOptions>,
      never,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Create many ViewerAuths.
     * @param {ViewerAuthCreateManyArgs} args - Arguments to create many ViewerAuths.
     * @example
     * // Create many ViewerAuths
     * const viewerAuth = await prisma.viewerAuth.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     */
    createMany<T extends ViewerAuthCreateManyArgs>(
      args?: SelectSubset<T, ViewerAuthCreateManyArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<BatchPayload>;

    /**
     * Create many ViewerAuths and returns the data saved in the database.
     * @param {ViewerAuthCreateManyAndReturnArgs} args - Arguments to create many ViewerAuths.
     * @example
     * // Create many ViewerAuths
     * const viewerAuth = await prisma.viewerAuth.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Create many ViewerAuths and only return the `id`
     * const viewerAuthWithIdOnly = await prisma.viewerAuth.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    createManyAndReturn<T extends ViewerAuthCreateManyAndReturnArgs>(
      args?: SelectSubset<T, ViewerAuthCreateManyAndReturnArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<
      $Result.GetResult<Prisma.$ViewerAuthPayload<ExtArgs>, T, 'createManyAndReturn', GlobalOmitOptions>
    >;

    /**
     * Delete a ViewerAuth.
     * @param {ViewerAuthDeleteArgs} args - Arguments to delete one ViewerAuth.
     * @example
     * // Delete one ViewerAuth
     * const ViewerAuth = await prisma.viewerAuth.delete({
     *   where: {
     *     // ... filter to delete one ViewerAuth
     *   }
     * })
     *
     */
    delete<T extends ViewerAuthDeleteArgs>(
      args: SelectSubset<T, ViewerAuthDeleteArgs<ExtArgs>>,
    ): Prisma__ViewerAuthClient<
      $Result.GetResult<Prisma.$ViewerAuthPayload<ExtArgs>, T, 'delete', GlobalOmitOptions>,
      never,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Update one ViewerAuth.
     * @param {ViewerAuthUpdateArgs} args - Arguments to update one ViewerAuth.
     * @example
     * // Update one ViewerAuth
     * const viewerAuth = await prisma.viewerAuth.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    update<T extends ViewerAuthUpdateArgs>(
      args: SelectSubset<T, ViewerAuthUpdateArgs<ExtArgs>>,
    ): Prisma__ViewerAuthClient<
      $Result.GetResult<Prisma.$ViewerAuthPayload<ExtArgs>, T, 'update', GlobalOmitOptions>,
      never,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Delete zero or more ViewerAuths.
     * @param {ViewerAuthDeleteManyArgs} args - Arguments to filter ViewerAuths to delete.
     * @example
     * // Delete a few ViewerAuths
     * const { count } = await prisma.viewerAuth.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     *
     */
    deleteMany<T extends ViewerAuthDeleteManyArgs>(
      args?: SelectSubset<T, ViewerAuthDeleteManyArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<BatchPayload>;

    /**
     * Update zero or more ViewerAuths.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ViewerAuthUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many ViewerAuths
     * const viewerAuth = await prisma.viewerAuth.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    updateMany<T extends ViewerAuthUpdateManyArgs>(
      args: SelectSubset<T, ViewerAuthUpdateManyArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<BatchPayload>;

    /**
     * Update zero or more ViewerAuths and returns the data updated in the database.
     * @param {ViewerAuthUpdateManyAndReturnArgs} args - Arguments to update many ViewerAuths.
     * @example
     * // Update many ViewerAuths
     * const viewerAuth = await prisma.viewerAuth.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Update zero or more ViewerAuths and only return the `id`
     * const viewerAuthWithIdOnly = await prisma.viewerAuth.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    updateManyAndReturn<T extends ViewerAuthUpdateManyAndReturnArgs>(
      args: SelectSubset<T, ViewerAuthUpdateManyAndReturnArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<
      $Result.GetResult<Prisma.$ViewerAuthPayload<ExtArgs>, T, 'updateManyAndReturn', GlobalOmitOptions>
    >;

    /**
     * Create or update one ViewerAuth.
     * @param {ViewerAuthUpsertArgs} args - Arguments to update or create a ViewerAuth.
     * @example
     * // Update or create a ViewerAuth
     * const viewerAuth = await prisma.viewerAuth.upsert({
     *   create: {
     *     // ... data to create a ViewerAuth
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the ViewerAuth we want to update
     *   }
     * })
     */
    upsert<T extends ViewerAuthUpsertArgs>(
      args: SelectSubset<T, ViewerAuthUpsertArgs<ExtArgs>>,
    ): Prisma__ViewerAuthClient<
      $Result.GetResult<Prisma.$ViewerAuthPayload<ExtArgs>, T, 'upsert', GlobalOmitOptions>,
      never,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Count the number of ViewerAuths.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ViewerAuthCountArgs} args - Arguments to filter ViewerAuths to count.
     * @example
     * // Count the number of ViewerAuths
     * const count = await prisma.viewerAuth.count({
     *   where: {
     *     // ... the filter for the ViewerAuths we want to count
     *   }
     * })
     **/
    count<T extends ViewerAuthCountArgs>(
      args?: Subset<T, ViewerAuthCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], ViewerAuthCountAggregateOutputType>
        : number
    >;

    /**
     * Allows you to perform aggregations operations on a ViewerAuth.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ViewerAuthAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
     **/
    aggregate<T extends ViewerAuthAggregateArgs>(
      args: Subset<T, ViewerAuthAggregateArgs>,
    ): Prisma.PrismaPromise<GetViewerAuthAggregateType<T>>;

    /**
     * Group by ViewerAuth.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ViewerAuthGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     *
     **/
    groupBy<
      T extends ViewerAuthGroupByArgs,
      HasSelectOrTake extends Or<Extends<'skip', Keys<T>>, Extends<'take', Keys<T>>>,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: ViewerAuthGroupByArgs['orderBy'] }
        : { orderBy?: ViewerAuthGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
        ? `Error: "by" must not be empty.`
        : HavingValid extends False
          ? {
              [P in HavingFields]: P extends ByFields
                ? never
                : P extends string
                  ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
                  : [Error, 'Field ', P, ` in "having" needs to be provided in "by"`];
            }[HavingFields]
          : 'take' extends Keys<T>
            ? 'orderBy' extends Keys<T>
              ? ByValid extends True
                ? {}
                : {
                    [P in OrderFields]: P extends ByFields
                      ? never
                      : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
                  }[OrderFields]
              : 'Error: If you provide "take", you also need to provide "orderBy"'
            : 'skip' extends Keys<T>
              ? 'orderBy' extends Keys<T>
                ? ByValid extends True
                  ? {}
                  : {
                      [P in OrderFields]: P extends ByFields
                        ? never
                        : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
                    }[OrderFields]
                : 'Error: If you provide "skip", you also need to provide "orderBy"'
              : ByValid extends True
                ? {}
                : {
                    [P in OrderFields]: P extends ByFields
                      ? never
                      : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
                  }[OrderFields],
    >(
      args: SubsetIntersection<T, ViewerAuthGroupByArgs, OrderByArg> & InputErrors,
    ): {} extends InputErrors ? GetViewerAuthGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>;
    /**
     * Fields of the ViewerAuth model
     */
    readonly fields: ViewerAuthFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for ViewerAuth.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__ViewerAuthClient<
    T,
    Null = never,
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
    GlobalOmitOptions = {},
  > extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: 'PrismaPromise';
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(
      onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null,
      onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null,
    ): $Utils.JsPromise<TResult1 | TResult2>;
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(
      onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null,
    ): $Utils.JsPromise<T | TResult>;
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>;
  }

  /**
   * Fields of the ViewerAuth model
   */
  interface ViewerAuthFieldRefs {
    readonly id: FieldRef<'ViewerAuth', 'String'>;
    readonly code: FieldRef<'ViewerAuth', 'String'>;
    readonly createdAt: FieldRef<'ViewerAuth', 'DateTime'>;
    readonly updatedAt: FieldRef<'ViewerAuth', 'DateTime'>;
  }

  // Custom InputTypes
  /**
   * ViewerAuth findUnique
   */
  export type ViewerAuthFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ViewerAuth
     */
    select?: ViewerAuthSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the ViewerAuth
     */
    omit?: ViewerAuthOmit<ExtArgs> | null;
    /**
     * Filter, which ViewerAuth to fetch.
     */
    where: ViewerAuthWhereUniqueInput;
  };

  /**
   * ViewerAuth findUniqueOrThrow
   */
  export type ViewerAuthFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ViewerAuth
     */
    select?: ViewerAuthSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the ViewerAuth
     */
    omit?: ViewerAuthOmit<ExtArgs> | null;
    /**
     * Filter, which ViewerAuth to fetch.
     */
    where: ViewerAuthWhereUniqueInput;
  };

  /**
   * ViewerAuth findFirst
   */
  export type ViewerAuthFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ViewerAuth
     */
    select?: ViewerAuthSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the ViewerAuth
     */
    omit?: ViewerAuthOmit<ExtArgs> | null;
    /**
     * Filter, which ViewerAuth to fetch.
     */
    where?: ViewerAuthWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of ViewerAuths to fetch.
     */
    orderBy?: ViewerAuthOrderByWithRelationInput | ViewerAuthOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for ViewerAuths.
     */
    cursor?: ViewerAuthWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` ViewerAuths from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` ViewerAuths.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of ViewerAuths.
     */
    distinct?: ViewerAuthScalarFieldEnum | ViewerAuthScalarFieldEnum[];
  };

  /**
   * ViewerAuth findFirstOrThrow
   */
  export type ViewerAuthFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ViewerAuth
     */
    select?: ViewerAuthSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the ViewerAuth
     */
    omit?: ViewerAuthOmit<ExtArgs> | null;
    /**
     * Filter, which ViewerAuth to fetch.
     */
    where?: ViewerAuthWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of ViewerAuths to fetch.
     */
    orderBy?: ViewerAuthOrderByWithRelationInput | ViewerAuthOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for ViewerAuths.
     */
    cursor?: ViewerAuthWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` ViewerAuths from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` ViewerAuths.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of ViewerAuths.
     */
    distinct?: ViewerAuthScalarFieldEnum | ViewerAuthScalarFieldEnum[];
  };

  /**
   * ViewerAuth findMany
   */
  export type ViewerAuthFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ViewerAuth
     */
    select?: ViewerAuthSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the ViewerAuth
     */
    omit?: ViewerAuthOmit<ExtArgs> | null;
    /**
     * Filter, which ViewerAuths to fetch.
     */
    where?: ViewerAuthWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of ViewerAuths to fetch.
     */
    orderBy?: ViewerAuthOrderByWithRelationInput | ViewerAuthOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for listing ViewerAuths.
     */
    cursor?: ViewerAuthWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` ViewerAuths from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` ViewerAuths.
     */
    skip?: number;
    distinct?: ViewerAuthScalarFieldEnum | ViewerAuthScalarFieldEnum[];
  };

  /**
   * ViewerAuth create
   */
  export type ViewerAuthCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ViewerAuth
     */
    select?: ViewerAuthSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the ViewerAuth
     */
    omit?: ViewerAuthOmit<ExtArgs> | null;
    /**
     * The data needed to create a ViewerAuth.
     */
    data: XOR<ViewerAuthCreateInput, ViewerAuthUncheckedCreateInput>;
  };

  /**
   * ViewerAuth createMany
   */
  export type ViewerAuthCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many ViewerAuths.
     */
    data: ViewerAuthCreateManyInput | ViewerAuthCreateManyInput[];
    skipDuplicates?: boolean;
  };

  /**
   * ViewerAuth createManyAndReturn
   */
  export type ViewerAuthCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ViewerAuth
     */
    select?: ViewerAuthSelectCreateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the ViewerAuth
     */
    omit?: ViewerAuthOmit<ExtArgs> | null;
    /**
     * The data used to create many ViewerAuths.
     */
    data: ViewerAuthCreateManyInput | ViewerAuthCreateManyInput[];
    skipDuplicates?: boolean;
  };

  /**
   * ViewerAuth update
   */
  export type ViewerAuthUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ViewerAuth
     */
    select?: ViewerAuthSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the ViewerAuth
     */
    omit?: ViewerAuthOmit<ExtArgs> | null;
    /**
     * The data needed to update a ViewerAuth.
     */
    data: XOR<ViewerAuthUpdateInput, ViewerAuthUncheckedUpdateInput>;
    /**
     * Choose, which ViewerAuth to update.
     */
    where: ViewerAuthWhereUniqueInput;
  };

  /**
   * ViewerAuth updateMany
   */
  export type ViewerAuthUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update ViewerAuths.
     */
    data: XOR<ViewerAuthUpdateManyMutationInput, ViewerAuthUncheckedUpdateManyInput>;
    /**
     * Filter which ViewerAuths to update
     */
    where?: ViewerAuthWhereInput;
    /**
     * Limit how many ViewerAuths to update.
     */
    limit?: number;
  };

  /**
   * ViewerAuth updateManyAndReturn
   */
  export type ViewerAuthUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ViewerAuth
     */
    select?: ViewerAuthSelectUpdateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the ViewerAuth
     */
    omit?: ViewerAuthOmit<ExtArgs> | null;
    /**
     * The data used to update ViewerAuths.
     */
    data: XOR<ViewerAuthUpdateManyMutationInput, ViewerAuthUncheckedUpdateManyInput>;
    /**
     * Filter which ViewerAuths to update
     */
    where?: ViewerAuthWhereInput;
    /**
     * Limit how many ViewerAuths to update.
     */
    limit?: number;
  };

  /**
   * ViewerAuth upsert
   */
  export type ViewerAuthUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ViewerAuth
     */
    select?: ViewerAuthSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the ViewerAuth
     */
    omit?: ViewerAuthOmit<ExtArgs> | null;
    /**
     * The filter to search for the ViewerAuth to update in case it exists.
     */
    where: ViewerAuthWhereUniqueInput;
    /**
     * In case the ViewerAuth found by the `where` argument doesn't exist, create a new ViewerAuth with this data.
     */
    create: XOR<ViewerAuthCreateInput, ViewerAuthUncheckedCreateInput>;
    /**
     * In case the ViewerAuth was found with the provided `where` argument, update it with this data.
     */
    update: XOR<ViewerAuthUpdateInput, ViewerAuthUncheckedUpdateInput>;
  };

  /**
   * ViewerAuth delete
   */
  export type ViewerAuthDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ViewerAuth
     */
    select?: ViewerAuthSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the ViewerAuth
     */
    omit?: ViewerAuthOmit<ExtArgs> | null;
    /**
     * Filter which ViewerAuth to delete.
     */
    where: ViewerAuthWhereUniqueInput;
  };

  /**
   * ViewerAuth deleteMany
   */
  export type ViewerAuthDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which ViewerAuths to delete
     */
    where?: ViewerAuthWhereInput;
    /**
     * Limit how many ViewerAuths to delete.
     */
    limit?: number;
  };

  /**
   * ViewerAuth without action
   */
  export type ViewerAuthDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ViewerAuth
     */
    select?: ViewerAuthSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the ViewerAuth
     */
    omit?: ViewerAuthOmit<ExtArgs> | null;
  };

  /**
   * Model SkillSheet
   */

  export type AggregateSkillSheet = {
    _count: SkillSheetCountAggregateOutputType | null;
    _min: SkillSheetMinAggregateOutputType | null;
    _max: SkillSheetMaxAggregateOutputType | null;
  };

  export type SkillSheetMinAggregateOutputType = {
    id: string | null;
    title: string | null;
    content: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
  };

  export type SkillSheetMaxAggregateOutputType = {
    id: string | null;
    title: string | null;
    content: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
  };

  export type SkillSheetCountAggregateOutputType = {
    id: number;
    title: number;
    content: number;
    createdAt: number;
    updatedAt: number;
    _all: number;
  };

  export type SkillSheetMinAggregateInputType = {
    id?: true;
    title?: true;
    content?: true;
    createdAt?: true;
    updatedAt?: true;
  };

  export type SkillSheetMaxAggregateInputType = {
    id?: true;
    title?: true;
    content?: true;
    createdAt?: true;
    updatedAt?: true;
  };

  export type SkillSheetCountAggregateInputType = {
    id?: true;
    title?: true;
    content?: true;
    createdAt?: true;
    updatedAt?: true;
    _all?: true;
  };

  export type SkillSheetAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SkillSheet to aggregate.
     */
    where?: SkillSheetWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of SkillSheets to fetch.
     */
    orderBy?: SkillSheetOrderByWithRelationInput | SkillSheetOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the start position
     */
    cursor?: SkillSheetWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` SkillSheets from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` SkillSheets.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Count returned SkillSheets
     **/
    _count?: true | SkillSheetCountAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the minimum value
     **/
    _min?: SkillSheetMinAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the maximum value
     **/
    _max?: SkillSheetMaxAggregateInputType;
  };

  export type GetSkillSheetAggregateType<T extends SkillSheetAggregateArgs> = {
    [P in keyof T & keyof AggregateSkillSheet]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateSkillSheet[P]>
      : GetScalarType<T[P], AggregateSkillSheet[P]>;
  };

  export type SkillSheetGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SkillSheetWhereInput;
    orderBy?: SkillSheetOrderByWithAggregationInput | SkillSheetOrderByWithAggregationInput[];
    by: SkillSheetScalarFieldEnum[] | SkillSheetScalarFieldEnum;
    having?: SkillSheetScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: SkillSheetCountAggregateInputType | true;
    _min?: SkillSheetMinAggregateInputType;
    _max?: SkillSheetMaxAggregateInputType;
  };

  export type SkillSheetGroupByOutputType = {
    id: string;
    title: string;
    content: string;
    createdAt: Date;
    updatedAt: Date;
    _count: SkillSheetCountAggregateOutputType | null;
    _min: SkillSheetMinAggregateOutputType | null;
    _max: SkillSheetMaxAggregateOutputType | null;
  };

  type GetSkillSheetGroupByPayload<T extends SkillSheetGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<SkillSheetGroupByOutputType, T['by']> & {
        [P in keyof T & keyof SkillSheetGroupByOutputType]: P extends '_count'
          ? T[P] extends boolean
            ? number
            : GetScalarType<T[P], SkillSheetGroupByOutputType[P]>
          : GetScalarType<T[P], SkillSheetGroupByOutputType[P]>;
      }
    >
  >;

  export type SkillSheetSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    $Extensions.GetSelect<
      {
        id?: boolean;
        title?: boolean;
        content?: boolean;
        createdAt?: boolean;
        updatedAt?: boolean;
      },
      ExtArgs['result']['skillSheet']
    >;

  export type SkillSheetSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    $Extensions.GetSelect<
      {
        id?: boolean;
        title?: boolean;
        content?: boolean;
        createdAt?: boolean;
        updatedAt?: boolean;
      },
      ExtArgs['result']['skillSheet']
    >;

  export type SkillSheetSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    $Extensions.GetSelect<
      {
        id?: boolean;
        title?: boolean;
        content?: boolean;
        createdAt?: boolean;
        updatedAt?: boolean;
      },
      ExtArgs['result']['skillSheet']
    >;

  export type SkillSheetSelectScalar = {
    id?: boolean;
    title?: boolean;
    content?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
  };

  export type SkillSheetOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<
    'id' | 'title' | 'content' | 'createdAt' | 'updatedAt',
    ExtArgs['result']['skillSheet']
  >;

  export type $SkillSheetPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: 'SkillSheet';
    objects: {};
    scalars: $Extensions.GetPayloadResult<
      {
        id: string;
        title: string;
        content: string;
        createdAt: Date;
        updatedAt: Date;
      },
      ExtArgs['result']['skillSheet']
    >;
    composites: {};
  };

  type SkillSheetGetPayload<S extends boolean | null | undefined | SkillSheetDefaultArgs> = $Result.GetResult<
    Prisma.$SkillSheetPayload,
    S
  >;

  type SkillSheetCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = Omit<
    SkillSheetFindManyArgs,
    'select' | 'include' | 'distinct' | 'omit'
  > & {
    select?: SkillSheetCountAggregateInputType | true;
  };

  export interface SkillSheetDelegate<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
    GlobalOmitOptions = {},
  > {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['SkillSheet']; meta: { name: 'SkillSheet' } };
    /**
     * Find zero or one SkillSheet that matches the filter.
     * @param {SkillSheetFindUniqueArgs} args - Arguments to find a SkillSheet
     * @example
     * // Get one SkillSheet
     * const skillSheet = await prisma.skillSheet.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends SkillSheetFindUniqueArgs>(
      args: SelectSubset<T, SkillSheetFindUniqueArgs<ExtArgs>>,
    ): Prisma__SkillSheetClient<
      $Result.GetResult<Prisma.$SkillSheetPayload<ExtArgs>, T, 'findUnique', GlobalOmitOptions> | null,
      null,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Find one SkillSheet that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {SkillSheetFindUniqueOrThrowArgs} args - Arguments to find a SkillSheet
     * @example
     * // Get one SkillSheet
     * const skillSheet = await prisma.skillSheet.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends SkillSheetFindUniqueOrThrowArgs>(
      args: SelectSubset<T, SkillSheetFindUniqueOrThrowArgs<ExtArgs>>,
    ): Prisma__SkillSheetClient<
      $Result.GetResult<Prisma.$SkillSheetPayload<ExtArgs>, T, 'findUniqueOrThrow', GlobalOmitOptions>,
      never,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Find the first SkillSheet that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SkillSheetFindFirstArgs} args - Arguments to find a SkillSheet
     * @example
     * // Get one SkillSheet
     * const skillSheet = await prisma.skillSheet.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends SkillSheetFindFirstArgs>(
      args?: SelectSubset<T, SkillSheetFindFirstArgs<ExtArgs>>,
    ): Prisma__SkillSheetClient<
      $Result.GetResult<Prisma.$SkillSheetPayload<ExtArgs>, T, 'findFirst', GlobalOmitOptions> | null,
      null,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Find the first SkillSheet that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SkillSheetFindFirstOrThrowArgs} args - Arguments to find a SkillSheet
     * @example
     * // Get one SkillSheet
     * const skillSheet = await prisma.skillSheet.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends SkillSheetFindFirstOrThrowArgs>(
      args?: SelectSubset<T, SkillSheetFindFirstOrThrowArgs<ExtArgs>>,
    ): Prisma__SkillSheetClient<
      $Result.GetResult<Prisma.$SkillSheetPayload<ExtArgs>, T, 'findFirstOrThrow', GlobalOmitOptions>,
      never,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Find zero or more SkillSheets that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SkillSheetFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all SkillSheets
     * const skillSheets = await prisma.skillSheet.findMany()
     *
     * // Get first 10 SkillSheets
     * const skillSheets = await prisma.skillSheet.findMany({ take: 10 })
     *
     * // Only select the `id`
     * const skillSheetWithIdOnly = await prisma.skillSheet.findMany({ select: { id: true } })
     *
     */
    findMany<T extends SkillSheetFindManyArgs>(
      args?: SelectSubset<T, SkillSheetFindManyArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SkillSheetPayload<ExtArgs>, T, 'findMany', GlobalOmitOptions>>;

    /**
     * Create a SkillSheet.
     * @param {SkillSheetCreateArgs} args - Arguments to create a SkillSheet.
     * @example
     * // Create one SkillSheet
     * const SkillSheet = await prisma.skillSheet.create({
     *   data: {
     *     // ... data to create a SkillSheet
     *   }
     * })
     *
     */
    create<T extends SkillSheetCreateArgs>(
      args: SelectSubset<T, SkillSheetCreateArgs<ExtArgs>>,
    ): Prisma__SkillSheetClient<
      $Result.GetResult<Prisma.$SkillSheetPayload<ExtArgs>, T, 'create', GlobalOmitOptions>,
      never,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Create many SkillSheets.
     * @param {SkillSheetCreateManyArgs} args - Arguments to create many SkillSheets.
     * @example
     * // Create many SkillSheets
     * const skillSheet = await prisma.skillSheet.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     */
    createMany<T extends SkillSheetCreateManyArgs>(
      args?: SelectSubset<T, SkillSheetCreateManyArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<BatchPayload>;

    /**
     * Create many SkillSheets and returns the data saved in the database.
     * @param {SkillSheetCreateManyAndReturnArgs} args - Arguments to create many SkillSheets.
     * @example
     * // Create many SkillSheets
     * const skillSheet = await prisma.skillSheet.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Create many SkillSheets and only return the `id`
     * const skillSheetWithIdOnly = await prisma.skillSheet.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    createManyAndReturn<T extends SkillSheetCreateManyAndReturnArgs>(
      args?: SelectSubset<T, SkillSheetCreateManyAndReturnArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<
      $Result.GetResult<Prisma.$SkillSheetPayload<ExtArgs>, T, 'createManyAndReturn', GlobalOmitOptions>
    >;

    /**
     * Delete a SkillSheet.
     * @param {SkillSheetDeleteArgs} args - Arguments to delete one SkillSheet.
     * @example
     * // Delete one SkillSheet
     * const SkillSheet = await prisma.skillSheet.delete({
     *   where: {
     *     // ... filter to delete one SkillSheet
     *   }
     * })
     *
     */
    delete<T extends SkillSheetDeleteArgs>(
      args: SelectSubset<T, SkillSheetDeleteArgs<ExtArgs>>,
    ): Prisma__SkillSheetClient<
      $Result.GetResult<Prisma.$SkillSheetPayload<ExtArgs>, T, 'delete', GlobalOmitOptions>,
      never,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Update one SkillSheet.
     * @param {SkillSheetUpdateArgs} args - Arguments to update one SkillSheet.
     * @example
     * // Update one SkillSheet
     * const skillSheet = await prisma.skillSheet.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    update<T extends SkillSheetUpdateArgs>(
      args: SelectSubset<T, SkillSheetUpdateArgs<ExtArgs>>,
    ): Prisma__SkillSheetClient<
      $Result.GetResult<Prisma.$SkillSheetPayload<ExtArgs>, T, 'update', GlobalOmitOptions>,
      never,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Delete zero or more SkillSheets.
     * @param {SkillSheetDeleteManyArgs} args - Arguments to filter SkillSheets to delete.
     * @example
     * // Delete a few SkillSheets
     * const { count } = await prisma.skillSheet.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     *
     */
    deleteMany<T extends SkillSheetDeleteManyArgs>(
      args?: SelectSubset<T, SkillSheetDeleteManyArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<BatchPayload>;

    /**
     * Update zero or more SkillSheets.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SkillSheetUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many SkillSheets
     * const skillSheet = await prisma.skillSheet.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    updateMany<T extends SkillSheetUpdateManyArgs>(
      args: SelectSubset<T, SkillSheetUpdateManyArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<BatchPayload>;

    /**
     * Update zero or more SkillSheets and returns the data updated in the database.
     * @param {SkillSheetUpdateManyAndReturnArgs} args - Arguments to update many SkillSheets.
     * @example
     * // Update many SkillSheets
     * const skillSheet = await prisma.skillSheet.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Update zero or more SkillSheets and only return the `id`
     * const skillSheetWithIdOnly = await prisma.skillSheet.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    updateManyAndReturn<T extends SkillSheetUpdateManyAndReturnArgs>(
      args: SelectSubset<T, SkillSheetUpdateManyAndReturnArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<
      $Result.GetResult<Prisma.$SkillSheetPayload<ExtArgs>, T, 'updateManyAndReturn', GlobalOmitOptions>
    >;

    /**
     * Create or update one SkillSheet.
     * @param {SkillSheetUpsertArgs} args - Arguments to update or create a SkillSheet.
     * @example
     * // Update or create a SkillSheet
     * const skillSheet = await prisma.skillSheet.upsert({
     *   create: {
     *     // ... data to create a SkillSheet
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the SkillSheet we want to update
     *   }
     * })
     */
    upsert<T extends SkillSheetUpsertArgs>(
      args: SelectSubset<T, SkillSheetUpsertArgs<ExtArgs>>,
    ): Prisma__SkillSheetClient<
      $Result.GetResult<Prisma.$SkillSheetPayload<ExtArgs>, T, 'upsert', GlobalOmitOptions>,
      never,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Count the number of SkillSheets.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SkillSheetCountArgs} args - Arguments to filter SkillSheets to count.
     * @example
     * // Count the number of SkillSheets
     * const count = await prisma.skillSheet.count({
     *   where: {
     *     // ... the filter for the SkillSheets we want to count
     *   }
     * })
     **/
    count<T extends SkillSheetCountArgs>(
      args?: Subset<T, SkillSheetCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], SkillSheetCountAggregateOutputType>
        : number
    >;

    /**
     * Allows you to perform aggregations operations on a SkillSheet.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SkillSheetAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
     **/
    aggregate<T extends SkillSheetAggregateArgs>(
      args: Subset<T, SkillSheetAggregateArgs>,
    ): Prisma.PrismaPromise<GetSkillSheetAggregateType<T>>;

    /**
     * Group by SkillSheet.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SkillSheetGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     *
     **/
    groupBy<
      T extends SkillSheetGroupByArgs,
      HasSelectOrTake extends Or<Extends<'skip', Keys<T>>, Extends<'take', Keys<T>>>,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: SkillSheetGroupByArgs['orderBy'] }
        : { orderBy?: SkillSheetGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
        ? `Error: "by" must not be empty.`
        : HavingValid extends False
          ? {
              [P in HavingFields]: P extends ByFields
                ? never
                : P extends string
                  ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
                  : [Error, 'Field ', P, ` in "having" needs to be provided in "by"`];
            }[HavingFields]
          : 'take' extends Keys<T>
            ? 'orderBy' extends Keys<T>
              ? ByValid extends True
                ? {}
                : {
                    [P in OrderFields]: P extends ByFields
                      ? never
                      : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
                  }[OrderFields]
              : 'Error: If you provide "take", you also need to provide "orderBy"'
            : 'skip' extends Keys<T>
              ? 'orderBy' extends Keys<T>
                ? ByValid extends True
                  ? {}
                  : {
                      [P in OrderFields]: P extends ByFields
                        ? never
                        : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
                    }[OrderFields]
                : 'Error: If you provide "skip", you also need to provide "orderBy"'
              : ByValid extends True
                ? {}
                : {
                    [P in OrderFields]: P extends ByFields
                      ? never
                      : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
                  }[OrderFields],
    >(
      args: SubsetIntersection<T, SkillSheetGroupByArgs, OrderByArg> & InputErrors,
    ): {} extends InputErrors ? GetSkillSheetGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>;
    /**
     * Fields of the SkillSheet model
     */
    readonly fields: SkillSheetFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for SkillSheet.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__SkillSheetClient<
    T,
    Null = never,
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
    GlobalOmitOptions = {},
  > extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: 'PrismaPromise';
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(
      onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null,
      onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null,
    ): $Utils.JsPromise<TResult1 | TResult2>;
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(
      onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null,
    ): $Utils.JsPromise<T | TResult>;
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>;
  }

  /**
   * Fields of the SkillSheet model
   */
  interface SkillSheetFieldRefs {
    readonly id: FieldRef<'SkillSheet', 'String'>;
    readonly title: FieldRef<'SkillSheet', 'String'>;
    readonly content: FieldRef<'SkillSheet', 'String'>;
    readonly createdAt: FieldRef<'SkillSheet', 'DateTime'>;
    readonly updatedAt: FieldRef<'SkillSheet', 'DateTime'>;
  }

  // Custom InputTypes
  /**
   * SkillSheet findUnique
   */
  export type SkillSheetFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SkillSheet
     */
    select?: SkillSheetSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the SkillSheet
     */
    omit?: SkillSheetOmit<ExtArgs> | null;
    /**
     * Filter, which SkillSheet to fetch.
     */
    where: SkillSheetWhereUniqueInput;
  };

  /**
   * SkillSheet findUniqueOrThrow
   */
  export type SkillSheetFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SkillSheet
     */
    select?: SkillSheetSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the SkillSheet
     */
    omit?: SkillSheetOmit<ExtArgs> | null;
    /**
     * Filter, which SkillSheet to fetch.
     */
    where: SkillSheetWhereUniqueInput;
  };

  /**
   * SkillSheet findFirst
   */
  export type SkillSheetFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SkillSheet
     */
    select?: SkillSheetSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the SkillSheet
     */
    omit?: SkillSheetOmit<ExtArgs> | null;
    /**
     * Filter, which SkillSheet to fetch.
     */
    where?: SkillSheetWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of SkillSheets to fetch.
     */
    orderBy?: SkillSheetOrderByWithRelationInput | SkillSheetOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for SkillSheets.
     */
    cursor?: SkillSheetWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` SkillSheets from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` SkillSheets.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of SkillSheets.
     */
    distinct?: SkillSheetScalarFieldEnum | SkillSheetScalarFieldEnum[];
  };

  /**
   * SkillSheet findFirstOrThrow
   */
  export type SkillSheetFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SkillSheet
     */
    select?: SkillSheetSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the SkillSheet
     */
    omit?: SkillSheetOmit<ExtArgs> | null;
    /**
     * Filter, which SkillSheet to fetch.
     */
    where?: SkillSheetWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of SkillSheets to fetch.
     */
    orderBy?: SkillSheetOrderByWithRelationInput | SkillSheetOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for SkillSheets.
     */
    cursor?: SkillSheetWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` SkillSheets from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` SkillSheets.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of SkillSheets.
     */
    distinct?: SkillSheetScalarFieldEnum | SkillSheetScalarFieldEnum[];
  };

  /**
   * SkillSheet findMany
   */
  export type SkillSheetFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SkillSheet
     */
    select?: SkillSheetSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the SkillSheet
     */
    omit?: SkillSheetOmit<ExtArgs> | null;
    /**
     * Filter, which SkillSheets to fetch.
     */
    where?: SkillSheetWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of SkillSheets to fetch.
     */
    orderBy?: SkillSheetOrderByWithRelationInput | SkillSheetOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for listing SkillSheets.
     */
    cursor?: SkillSheetWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` SkillSheets from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` SkillSheets.
     */
    skip?: number;
    distinct?: SkillSheetScalarFieldEnum | SkillSheetScalarFieldEnum[];
  };

  /**
   * SkillSheet create
   */
  export type SkillSheetCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SkillSheet
     */
    select?: SkillSheetSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the SkillSheet
     */
    omit?: SkillSheetOmit<ExtArgs> | null;
    /**
     * The data needed to create a SkillSheet.
     */
    data: XOR<SkillSheetCreateInput, SkillSheetUncheckedCreateInput>;
  };

  /**
   * SkillSheet createMany
   */
  export type SkillSheetCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many SkillSheets.
     */
    data: SkillSheetCreateManyInput | SkillSheetCreateManyInput[];
    skipDuplicates?: boolean;
  };

  /**
   * SkillSheet createManyAndReturn
   */
  export type SkillSheetCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SkillSheet
     */
    select?: SkillSheetSelectCreateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the SkillSheet
     */
    omit?: SkillSheetOmit<ExtArgs> | null;
    /**
     * The data used to create many SkillSheets.
     */
    data: SkillSheetCreateManyInput | SkillSheetCreateManyInput[];
    skipDuplicates?: boolean;
  };

  /**
   * SkillSheet update
   */
  export type SkillSheetUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SkillSheet
     */
    select?: SkillSheetSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the SkillSheet
     */
    omit?: SkillSheetOmit<ExtArgs> | null;
    /**
     * The data needed to update a SkillSheet.
     */
    data: XOR<SkillSheetUpdateInput, SkillSheetUncheckedUpdateInput>;
    /**
     * Choose, which SkillSheet to update.
     */
    where: SkillSheetWhereUniqueInput;
  };

  /**
   * SkillSheet updateMany
   */
  export type SkillSheetUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update SkillSheets.
     */
    data: XOR<SkillSheetUpdateManyMutationInput, SkillSheetUncheckedUpdateManyInput>;
    /**
     * Filter which SkillSheets to update
     */
    where?: SkillSheetWhereInput;
    /**
     * Limit how many SkillSheets to update.
     */
    limit?: number;
  };

  /**
   * SkillSheet updateManyAndReturn
   */
  export type SkillSheetUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SkillSheet
     */
    select?: SkillSheetSelectUpdateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the SkillSheet
     */
    omit?: SkillSheetOmit<ExtArgs> | null;
    /**
     * The data used to update SkillSheets.
     */
    data: XOR<SkillSheetUpdateManyMutationInput, SkillSheetUncheckedUpdateManyInput>;
    /**
     * Filter which SkillSheets to update
     */
    where?: SkillSheetWhereInput;
    /**
     * Limit how many SkillSheets to update.
     */
    limit?: number;
  };

  /**
   * SkillSheet upsert
   */
  export type SkillSheetUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SkillSheet
     */
    select?: SkillSheetSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the SkillSheet
     */
    omit?: SkillSheetOmit<ExtArgs> | null;
    /**
     * The filter to search for the SkillSheet to update in case it exists.
     */
    where: SkillSheetWhereUniqueInput;
    /**
     * In case the SkillSheet found by the `where` argument doesn't exist, create a new SkillSheet with this data.
     */
    create: XOR<SkillSheetCreateInput, SkillSheetUncheckedCreateInput>;
    /**
     * In case the SkillSheet was found with the provided `where` argument, update it with this data.
     */
    update: XOR<SkillSheetUpdateInput, SkillSheetUncheckedUpdateInput>;
  };

  /**
   * SkillSheet delete
   */
  export type SkillSheetDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SkillSheet
     */
    select?: SkillSheetSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the SkillSheet
     */
    omit?: SkillSheetOmit<ExtArgs> | null;
    /**
     * Filter which SkillSheet to delete.
     */
    where: SkillSheetWhereUniqueInput;
  };

  /**
   * SkillSheet deleteMany
   */
  export type SkillSheetDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SkillSheets to delete
     */
    where?: SkillSheetWhereInput;
    /**
     * Limit how many SkillSheets to delete.
     */
    limit?: number;
  };

  /**
   * SkillSheet without action
   */
  export type SkillSheetDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SkillSheet
     */
    select?: SkillSheetSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the SkillSheet
     */
    omit?: SkillSheetOmit<ExtArgs> | null;
  };

  /**
   * Enums
   */

  export const TransactionIsolationLevel: {
    ReadUncommitted: 'ReadUncommitted';
    ReadCommitted: 'ReadCommitted';
    RepeatableRead: 'RepeatableRead';
    Serializable: 'Serializable';
  };

  export type TransactionIsolationLevel = (typeof TransactionIsolationLevel)[keyof typeof TransactionIsolationLevel];

  export const AdminScalarFieldEnum: {
    id: 'id';
    username: 'username';
    password: 'password';
    createdAt: 'createdAt';
    updatedAt: 'updatedAt';
  };

  export type AdminScalarFieldEnum = (typeof AdminScalarFieldEnum)[keyof typeof AdminScalarFieldEnum];

  export const ViewerAuthScalarFieldEnum: {
    id: 'id';
    code: 'code';
    createdAt: 'createdAt';
    updatedAt: 'updatedAt';
  };

  export type ViewerAuthScalarFieldEnum = (typeof ViewerAuthScalarFieldEnum)[keyof typeof ViewerAuthScalarFieldEnum];

  export const SkillSheetScalarFieldEnum: {
    id: 'id';
    title: 'title';
    content: 'content';
    createdAt: 'createdAt';
    updatedAt: 'updatedAt';
  };

  export type SkillSheetScalarFieldEnum = (typeof SkillSheetScalarFieldEnum)[keyof typeof SkillSheetScalarFieldEnum];

  export const SortOrder: {
    asc: 'asc';
    desc: 'desc';
  };

  export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder];

  export const QueryMode: {
    default: 'default';
    insensitive: 'insensitive';
  };

  export type QueryMode = (typeof QueryMode)[keyof typeof QueryMode];

  /**
   * Field references
   */

  /**
   * Reference to a field of type 'String'
   */
  export type StringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String'>;

  /**
   * Reference to a field of type 'String[]'
   */
  export type ListStringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String[]'>;

  /**
   * Reference to a field of type 'DateTime'
   */
  export type DateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime'>;

  /**
   * Reference to a field of type 'DateTime[]'
   */
  export type ListDateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime[]'>;

  /**
   * Reference to a field of type 'Int'
   */
  export type IntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int'>;

  /**
   * Reference to a field of type 'Int[]'
   */
  export type ListIntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int[]'>;

  /**
   * Deep Input Types
   */

  export type AdminWhereInput = {
    AND?: AdminWhereInput | AdminWhereInput[];
    OR?: AdminWhereInput[];
    NOT?: AdminWhereInput | AdminWhereInput[];
    id?: StringFilter<'Admin'> | string;
    username?: StringFilter<'Admin'> | string;
    password?: StringFilter<'Admin'> | string;
    createdAt?: DateTimeFilter<'Admin'> | Date | string;
    updatedAt?: DateTimeFilter<'Admin'> | Date | string;
  };

  export type AdminOrderByWithRelationInput = {
    id?: SortOrder;
    username?: SortOrder;
    password?: SortOrder;
    createdAt?: SortOrder;
    updatedAt?: SortOrder;
  };

  export type AdminWhereUniqueInput = Prisma.AtLeast<
    {
      id?: string;
      username?: string;
      AND?: AdminWhereInput | AdminWhereInput[];
      OR?: AdminWhereInput[];
      NOT?: AdminWhereInput | AdminWhereInput[];
      password?: StringFilter<'Admin'> | string;
      createdAt?: DateTimeFilter<'Admin'> | Date | string;
      updatedAt?: DateTimeFilter<'Admin'> | Date | string;
    },
    'id' | 'username'
  >;

  export type AdminOrderByWithAggregationInput = {
    id?: SortOrder;
    username?: SortOrder;
    password?: SortOrder;
    createdAt?: SortOrder;
    updatedAt?: SortOrder;
    _count?: AdminCountOrderByAggregateInput;
    _max?: AdminMaxOrderByAggregateInput;
    _min?: AdminMinOrderByAggregateInput;
  };

  export type AdminScalarWhereWithAggregatesInput = {
    AND?: AdminScalarWhereWithAggregatesInput | AdminScalarWhereWithAggregatesInput[];
    OR?: AdminScalarWhereWithAggregatesInput[];
    NOT?: AdminScalarWhereWithAggregatesInput | AdminScalarWhereWithAggregatesInput[];
    id?: StringWithAggregatesFilter<'Admin'> | string;
    username?: StringWithAggregatesFilter<'Admin'> | string;
    password?: StringWithAggregatesFilter<'Admin'> | string;
    createdAt?: DateTimeWithAggregatesFilter<'Admin'> | Date | string;
    updatedAt?: DateTimeWithAggregatesFilter<'Admin'> | Date | string;
  };

  export type ViewerAuthWhereInput = {
    AND?: ViewerAuthWhereInput | ViewerAuthWhereInput[];
    OR?: ViewerAuthWhereInput[];
    NOT?: ViewerAuthWhereInput | ViewerAuthWhereInput[];
    id?: StringFilter<'ViewerAuth'> | string;
    code?: StringFilter<'ViewerAuth'> | string;
    createdAt?: DateTimeFilter<'ViewerAuth'> | Date | string;
    updatedAt?: DateTimeFilter<'ViewerAuth'> | Date | string;
  };

  export type ViewerAuthOrderByWithRelationInput = {
    id?: SortOrder;
    code?: SortOrder;
    createdAt?: SortOrder;
    updatedAt?: SortOrder;
  };

  export type ViewerAuthWhereUniqueInput = Prisma.AtLeast<
    {
      id?: string;
      code?: string;
      AND?: ViewerAuthWhereInput | ViewerAuthWhereInput[];
      OR?: ViewerAuthWhereInput[];
      NOT?: ViewerAuthWhereInput | ViewerAuthWhereInput[];
      createdAt?: DateTimeFilter<'ViewerAuth'> | Date | string;
      updatedAt?: DateTimeFilter<'ViewerAuth'> | Date | string;
    },
    'id' | 'code'
  >;

  export type ViewerAuthOrderByWithAggregationInput = {
    id?: SortOrder;
    code?: SortOrder;
    createdAt?: SortOrder;
    updatedAt?: SortOrder;
    _count?: ViewerAuthCountOrderByAggregateInput;
    _max?: ViewerAuthMaxOrderByAggregateInput;
    _min?: ViewerAuthMinOrderByAggregateInput;
  };

  export type ViewerAuthScalarWhereWithAggregatesInput = {
    AND?: ViewerAuthScalarWhereWithAggregatesInput | ViewerAuthScalarWhereWithAggregatesInput[];
    OR?: ViewerAuthScalarWhereWithAggregatesInput[];
    NOT?: ViewerAuthScalarWhereWithAggregatesInput | ViewerAuthScalarWhereWithAggregatesInput[];
    id?: StringWithAggregatesFilter<'ViewerAuth'> | string;
    code?: StringWithAggregatesFilter<'ViewerAuth'> | string;
    createdAt?: DateTimeWithAggregatesFilter<'ViewerAuth'> | Date | string;
    updatedAt?: DateTimeWithAggregatesFilter<'ViewerAuth'> | Date | string;
  };

  export type SkillSheetWhereInput = {
    AND?: SkillSheetWhereInput | SkillSheetWhereInput[];
    OR?: SkillSheetWhereInput[];
    NOT?: SkillSheetWhereInput | SkillSheetWhereInput[];
    id?: StringFilter<'SkillSheet'> | string;
    title?: StringFilter<'SkillSheet'> | string;
    content?: StringFilter<'SkillSheet'> | string;
    createdAt?: DateTimeFilter<'SkillSheet'> | Date | string;
    updatedAt?: DateTimeFilter<'SkillSheet'> | Date | string;
  };

  export type SkillSheetOrderByWithRelationInput = {
    id?: SortOrder;
    title?: SortOrder;
    content?: SortOrder;
    createdAt?: SortOrder;
    updatedAt?: SortOrder;
  };

  export type SkillSheetWhereUniqueInput = Prisma.AtLeast<
    {
      id?: string;
      AND?: SkillSheetWhereInput | SkillSheetWhereInput[];
      OR?: SkillSheetWhereInput[];
      NOT?: SkillSheetWhereInput | SkillSheetWhereInput[];
      title?: StringFilter<'SkillSheet'> | string;
      content?: StringFilter<'SkillSheet'> | string;
      createdAt?: DateTimeFilter<'SkillSheet'> | Date | string;
      updatedAt?: DateTimeFilter<'SkillSheet'> | Date | string;
    },
    'id'
  >;

  export type SkillSheetOrderByWithAggregationInput = {
    id?: SortOrder;
    title?: SortOrder;
    content?: SortOrder;
    createdAt?: SortOrder;
    updatedAt?: SortOrder;
    _count?: SkillSheetCountOrderByAggregateInput;
    _max?: SkillSheetMaxOrderByAggregateInput;
    _min?: SkillSheetMinOrderByAggregateInput;
  };

  export type SkillSheetScalarWhereWithAggregatesInput = {
    AND?: SkillSheetScalarWhereWithAggregatesInput | SkillSheetScalarWhereWithAggregatesInput[];
    OR?: SkillSheetScalarWhereWithAggregatesInput[];
    NOT?: SkillSheetScalarWhereWithAggregatesInput | SkillSheetScalarWhereWithAggregatesInput[];
    id?: StringWithAggregatesFilter<'SkillSheet'> | string;
    title?: StringWithAggregatesFilter<'SkillSheet'> | string;
    content?: StringWithAggregatesFilter<'SkillSheet'> | string;
    createdAt?: DateTimeWithAggregatesFilter<'SkillSheet'> | Date | string;
    updatedAt?: DateTimeWithAggregatesFilter<'SkillSheet'> | Date | string;
  };

  export type AdminCreateInput = {
    id?: string;
    username: string;
    password: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
  };

  export type AdminUncheckedCreateInput = {
    id?: string;
    username: string;
    password: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
  };

  export type AdminUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string;
    username?: StringFieldUpdateOperationsInput | string;
    password?: StringFieldUpdateOperationsInput | string;
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string;
  };

  export type AdminUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string;
    username?: StringFieldUpdateOperationsInput | string;
    password?: StringFieldUpdateOperationsInput | string;
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string;
  };

  export type AdminCreateManyInput = {
    id?: string;
    username: string;
    password: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
  };

  export type AdminUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string;
    username?: StringFieldUpdateOperationsInput | string;
    password?: StringFieldUpdateOperationsInput | string;
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string;
  };

  export type AdminUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string;
    username?: StringFieldUpdateOperationsInput | string;
    password?: StringFieldUpdateOperationsInput | string;
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string;
  };

  export type ViewerAuthCreateInput = {
    id?: string;
    code: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
  };

  export type ViewerAuthUncheckedCreateInput = {
    id?: string;
    code: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
  };

  export type ViewerAuthUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string;
    code?: StringFieldUpdateOperationsInput | string;
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string;
  };

  export type ViewerAuthUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string;
    code?: StringFieldUpdateOperationsInput | string;
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string;
  };

  export type ViewerAuthCreateManyInput = {
    id?: string;
    code: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
  };

  export type ViewerAuthUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string;
    code?: StringFieldUpdateOperationsInput | string;
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string;
  };

  export type ViewerAuthUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string;
    code?: StringFieldUpdateOperationsInput | string;
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string;
  };

  export type SkillSheetCreateInput = {
    id?: string;
    title: string;
    content: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
  };

  export type SkillSheetUncheckedCreateInput = {
    id?: string;
    title: string;
    content: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
  };

  export type SkillSheetUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string;
    title?: StringFieldUpdateOperationsInput | string;
    content?: StringFieldUpdateOperationsInput | string;
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string;
  };

  export type SkillSheetUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string;
    title?: StringFieldUpdateOperationsInput | string;
    content?: StringFieldUpdateOperationsInput | string;
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string;
  };

  export type SkillSheetCreateManyInput = {
    id?: string;
    title: string;
    content: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
  };

  export type SkillSheetUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string;
    title?: StringFieldUpdateOperationsInput | string;
    content?: StringFieldUpdateOperationsInput | string;
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string;
  };

  export type SkillSheetUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string;
    title?: StringFieldUpdateOperationsInput | string;
    content?: StringFieldUpdateOperationsInput | string;
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string;
  };

  export type StringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>;
    in?: string[] | ListStringFieldRefInput<$PrismaModel>;
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>;
    lt?: string | StringFieldRefInput<$PrismaModel>;
    lte?: string | StringFieldRefInput<$PrismaModel>;
    gt?: string | StringFieldRefInput<$PrismaModel>;
    gte?: string | StringFieldRefInput<$PrismaModel>;
    contains?: string | StringFieldRefInput<$PrismaModel>;
    startsWith?: string | StringFieldRefInput<$PrismaModel>;
    endsWith?: string | StringFieldRefInput<$PrismaModel>;
    mode?: QueryMode;
    not?: NestedStringFilter<$PrismaModel> | string;
  };

  export type DateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>;
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>;
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string;
  };

  export type AdminCountOrderByAggregateInput = {
    id?: SortOrder;
    username?: SortOrder;
    password?: SortOrder;
    createdAt?: SortOrder;
    updatedAt?: SortOrder;
  };

  export type AdminMaxOrderByAggregateInput = {
    id?: SortOrder;
    username?: SortOrder;
    password?: SortOrder;
    createdAt?: SortOrder;
    updatedAt?: SortOrder;
  };

  export type AdminMinOrderByAggregateInput = {
    id?: SortOrder;
    username?: SortOrder;
    password?: SortOrder;
    createdAt?: SortOrder;
    updatedAt?: SortOrder;
  };

  export type StringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>;
    in?: string[] | ListStringFieldRefInput<$PrismaModel>;
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>;
    lt?: string | StringFieldRefInput<$PrismaModel>;
    lte?: string | StringFieldRefInput<$PrismaModel>;
    gt?: string | StringFieldRefInput<$PrismaModel>;
    gte?: string | StringFieldRefInput<$PrismaModel>;
    contains?: string | StringFieldRefInput<$PrismaModel>;
    startsWith?: string | StringFieldRefInput<$PrismaModel>;
    endsWith?: string | StringFieldRefInput<$PrismaModel>;
    mode?: QueryMode;
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string;
    _count?: NestedIntFilter<$PrismaModel>;
    _min?: NestedStringFilter<$PrismaModel>;
    _max?: NestedStringFilter<$PrismaModel>;
  };

  export type DateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>;
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>;
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string;
    _count?: NestedIntFilter<$PrismaModel>;
    _min?: NestedDateTimeFilter<$PrismaModel>;
    _max?: NestedDateTimeFilter<$PrismaModel>;
  };

  export type ViewerAuthCountOrderByAggregateInput = {
    id?: SortOrder;
    code?: SortOrder;
    createdAt?: SortOrder;
    updatedAt?: SortOrder;
  };

  export type ViewerAuthMaxOrderByAggregateInput = {
    id?: SortOrder;
    code?: SortOrder;
    createdAt?: SortOrder;
    updatedAt?: SortOrder;
  };

  export type ViewerAuthMinOrderByAggregateInput = {
    id?: SortOrder;
    code?: SortOrder;
    createdAt?: SortOrder;
    updatedAt?: SortOrder;
  };

  export type SkillSheetCountOrderByAggregateInput = {
    id?: SortOrder;
    title?: SortOrder;
    content?: SortOrder;
    createdAt?: SortOrder;
    updatedAt?: SortOrder;
  };

  export type SkillSheetMaxOrderByAggregateInput = {
    id?: SortOrder;
    title?: SortOrder;
    content?: SortOrder;
    createdAt?: SortOrder;
    updatedAt?: SortOrder;
  };

  export type SkillSheetMinOrderByAggregateInput = {
    id?: SortOrder;
    title?: SortOrder;
    content?: SortOrder;
    createdAt?: SortOrder;
    updatedAt?: SortOrder;
  };

  export type StringFieldUpdateOperationsInput = {
    set?: string;
  };

  export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string;
  };

  export type NestedStringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>;
    in?: string[] | ListStringFieldRefInput<$PrismaModel>;
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>;
    lt?: string | StringFieldRefInput<$PrismaModel>;
    lte?: string | StringFieldRefInput<$PrismaModel>;
    gt?: string | StringFieldRefInput<$PrismaModel>;
    gte?: string | StringFieldRefInput<$PrismaModel>;
    contains?: string | StringFieldRefInput<$PrismaModel>;
    startsWith?: string | StringFieldRefInput<$PrismaModel>;
    endsWith?: string | StringFieldRefInput<$PrismaModel>;
    not?: NestedStringFilter<$PrismaModel> | string;
  };

  export type NestedDateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>;
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>;
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string;
  };

  export type NestedStringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>;
    in?: string[] | ListStringFieldRefInput<$PrismaModel>;
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>;
    lt?: string | StringFieldRefInput<$PrismaModel>;
    lte?: string | StringFieldRefInput<$PrismaModel>;
    gt?: string | StringFieldRefInput<$PrismaModel>;
    gte?: string | StringFieldRefInput<$PrismaModel>;
    contains?: string | StringFieldRefInput<$PrismaModel>;
    startsWith?: string | StringFieldRefInput<$PrismaModel>;
    endsWith?: string | StringFieldRefInput<$PrismaModel>;
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string;
    _count?: NestedIntFilter<$PrismaModel>;
    _min?: NestedStringFilter<$PrismaModel>;
    _max?: NestedStringFilter<$PrismaModel>;
  };

  export type NestedIntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>;
    in?: number[] | ListIntFieldRefInput<$PrismaModel>;
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>;
    lt?: number | IntFieldRefInput<$PrismaModel>;
    lte?: number | IntFieldRefInput<$PrismaModel>;
    gt?: number | IntFieldRefInput<$PrismaModel>;
    gte?: number | IntFieldRefInput<$PrismaModel>;
    not?: NestedIntFilter<$PrismaModel> | number;
  };

  export type NestedDateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>;
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>;
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string;
    _count?: NestedIntFilter<$PrismaModel>;
    _min?: NestedDateTimeFilter<$PrismaModel>;
    _max?: NestedDateTimeFilter<$PrismaModel>;
  };

  /**
   * Batch Payload for updateMany & deleteMany & createMany
   */

  export type BatchPayload = {
    count: number;
  };

  /**
   * DMMF
   */
  export const dmmf: runtime.BaseDMMF;
}
