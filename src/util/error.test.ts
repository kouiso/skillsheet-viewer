import { describe, it, expect } from 'vitest';
import getErrorMessage from './error';

describe('getErrorMessage', () => {
  describe('Errorインスタンスの場合', () => {
    it('Errorオブジェクトからメッセージを抽出すること', () => {
      const error = new Error('テストエラー');
      expect(getErrorMessage(error)).toBe('テストエラー');
    });

    it('空のメッセージを持つErrorを処理すること', () => {
      const error = new Error('');
      expect(getErrorMessage(error)).toBe('');
    });

    it('TypeErrorを処理すること', () => {
      const error = new TypeError('型エラー');
      expect(getErrorMessage(error)).toBe('型エラー');
    });

    it('RangeErrorを処理すること', () => {
      const error = new RangeError('範囲エラー');
      expect(getErrorMessage(error)).toBe('範囲エラー');
    });

    it('SyntaxErrorを処理すること', () => {
      const error = new SyntaxError('構文エラー');
      expect(getErrorMessage(error)).toBe('構文エラー');
    });

    it('ReferenceErrorを処理すること', () => {
      const error = new ReferenceError('参照エラー');
      expect(getErrorMessage(error)).toBe('参照エラー');
    });

    it('カスタムErrorクラスを処理すること', () => {
      class CustomError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'CustomError';
        }
      }
      const error = new CustomError('カスタムエラー');
      expect(getErrorMessage(error)).toBe('カスタムエラー');
    });
  });

  describe('文字列の場合', () => {
    it('文字列をそのまま返すこと', () => {
      expect(getErrorMessage('文字列エラー')).toBe('文字列エラー');
    });

    it('空文字列を処理すること', () => {
      expect(getErrorMessage('')).toBe('');
    });

    it('長い文字列を処理すること', () => {
      const longString = 'a'.repeat(1000);
      expect(getErrorMessage(longString)).toBe(longString);
    });

    it('日本語文字列を処理すること', () => {
      expect(getErrorMessage('日本語のエラーメッセージです')).toBe('日本語のエラーメッセージです');
    });

    it('特殊文字を含む文字列を処理すること', () => {
      expect(getErrorMessage('エラー: <script>alert("xss")</script>')).toBe(
        'エラー: <script>alert("xss")</script>',
      );
    });
  });

  describe('その他の型の場合', () => {
    it('nullの場合、デフォルトメッセージを返すこと', () => {
      expect(getErrorMessage(null)).toBe('不明なエラーが発生しました');
    });

    it('undefinedの場合、デフォルトメッセージを返すこと', () => {
      expect(getErrorMessage(undefined)).toBe('不明なエラーが発生しました');
    });

    it('数値の場合、デフォルトメッセージを返すこと', () => {
      expect(getErrorMessage(42)).toBe('不明なエラーが発生しました');
    });

    it('0の場合、デフォルトメッセージを返すこと', () => {
      expect(getErrorMessage(0)).toBe('不明なエラーが発生しました');
    });

    it('NaNの場合、デフォルトメッセージを返すこと', () => {
      expect(getErrorMessage(NaN)).toBe('不明なエラーが発生しました');
    });

    it('booleanの場合、デフォルトメッセージを返すこと', () => {
      expect(getErrorMessage(true)).toBe('不明なエラーが発生しました');
      expect(getErrorMessage(false)).toBe('不明なエラーが発生しました');
    });

    it('オブジェクトの場合、デフォルトメッセージを返すこと', () => {
      expect(getErrorMessage({ message: 'テスト' })).toBe('不明なエラーが発生しました');
    });

    it('配列の場合、デフォルトメッセージを返すこと', () => {
      expect(getErrorMessage(['エラー'])).toBe('不明なエラーが発生しました');
    });

    it('関数の場合、デフォルトメッセージを返すこと', () => {
      expect(getErrorMessage(() => 'error')).toBe('不明なエラーが発生しました');
    });

    it('Symbolの場合、デフォルトメッセージを返すこと', () => {
      expect(getErrorMessage(Symbol('error'))).toBe('不明なエラーが発生しました');
    });

    it('BigIntの場合、デフォルトメッセージを返すこと', () => {
      expect(getErrorMessage(BigInt(123))).toBe('不明なエラーが発生しました');
    });
  });

  describe('エッジケース', () => {
    it('messageプロパティを持つがErrorでないオブジェクトの場合、デフォルトメッセージを返すこと', () => {
      const errorLike = { message: 'エラーのようなオブジェクト', name: 'Error' };
      expect(getErrorMessage(errorLike)).toBe('不明なエラーが発生しました');
    });

    it('Errorをthrowしてcatchした場合、正しくメッセージを抽出すること', () => {
      try {
        throw new Error('スローされたエラー');
      } catch (error) {
        expect(getErrorMessage(error)).toBe('スローされたエラー');
      }
    });

    it('文字列をthrowしてcatchした場合、正しく処理すること', () => {
      try {
        throw 'スローされた文字列';
      } catch (error) {
        expect(getErrorMessage(error)).toBe('スローされた文字列');
      }
    });

    it('数値をthrowしてcatchした場合、デフォルトメッセージを返すこと', () => {
      try {
        throw 404;
      } catch (error) {
        expect(getErrorMessage(error)).toBe('不明なエラーが発生しました');
      }
    });
  });
});
