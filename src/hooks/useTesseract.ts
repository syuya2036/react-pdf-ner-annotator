import sortBy from 'lodash/sortBy';
import { useCallback, useEffect, useState } from 'react';
import { createWorker } from 'tesseract.js';
import {
	calculateFontSize,
	calculateRectangleProperties,
	calculateTransform,
	recalculateBoundingBox,
} from '../helpers/pdfHelpers';
import { OCRResult } from '../interfaces/orc';

const useTesseract = (scale: number, context: CanvasRenderingContext2D) => {
	const [ocrLoading, setOcrLoading] = useState(false);
	const [ocrError, setOcrError] = useState<string | undefined>(undefined);
	const [ocrResult, setOcrResult] = useState<OCRResult | null>(null);

	useEffect(() => {
		if (ocrResult && ocrResult.baseScale !== scale) {
			const rescaledWords = ocrResult.ocrWords.map((word) => {
				const coords = recalculateBoundingBox(word.coords, ocrResult.baseScale, scale);
				const fontSize = calculateFontSize(coords.width, coords.height, word.text);
				const transform = calculateTransform(coords.width, fontSize, word.fontFamily, word.text, context);
				return {
					...word,
					coords,
					fontSize,
					transform,
				};
			});

			setOcrResult({
				...ocrResult,
				ocrWords: rescaledWords,
				baseScale: scale,
			});
		}
	}, [ocrResult, scale, context]);

	const doOCR = useCallback(
		async (language = 'eng') => {
			setOcrLoading(true);
			try {
				// worker変数をここで定義して初期化する
				const worker = await createWorker();

				// 言語のロードと初期化
				await worker.loadLanguage(language);
				await worker.initialize(language);

				// テキスト認識の実行
				const result = await worker.recognize(context!.canvas);

				// 結果の処理
				setOcrError(undefined);
				setOcrLoading(false);
				const unsortedResult = result.data.words.map((word) => {
					const coords = calculateRectangleProperties(word.bbox);
					const fontSize = calculateFontSize(coords.width, coords.height, word.text);
					const fontFamily = word.font_name || 'sans-serif';
					const transform = calculateTransform(coords.width, fontSize, fontFamily, word.text, context);
					return {
						coords,
						text: word.text,
						fontSize,
						fontFamily,
						transform,
					};
				});

				setOcrResult({
					confidence: result.data.confidence,
					ocrWords: sortBy(unsortedResult, ['coords.top', 'coords.left']),
					baseScale: scale,
				});

				// 使い終わったworkerを終了
				await worker.terminate();

				return result;
			} catch (error) {
				setOcrResult(null);
				setOcrLoading(false);
				setOcrError(error as string);
				throw error;
			}
		},
		[scale, context],
	);

	return { ocrResult, ocrError, ocrLoading, doOCR };
};

export default useTesseract;
