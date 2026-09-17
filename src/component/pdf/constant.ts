// PDF 描画とフォント登録の双方から参照する共通のフォントファミリ名。
// ブラウザ専用の `?url` 取り込みを含めないことで、Node からの描画検証も可能にする。
const PDF_FONT_FAMILY = 'Noto Sans JP';

export default PDF_FONT_FAMILY;
