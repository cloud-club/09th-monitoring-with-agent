import { ryoppippi } from '@ryoppippi/eslint-config';

export default await ryoppippi(
	{
		ignores: ['dist/**', 'node_modules/**'],
		typescript: {
			tsconfigPath: 'tsconfig.eslint.json',
		},
	},
	{
		files: ['src/**/*.test.ts'],
		rules: {
			'ts/no-unsafe-argument': 'off',
			'ts/no-unsafe-assignment': 'off',
			'ts/no-unsafe-call': 'off',
			'ts/no-unsafe-member-access': 'off',
		},
	},
	{
		files: ['src/http/pagination.ts'],
		rules: {
			'style/operator-linebreak': 'off',
		},
	},
);
