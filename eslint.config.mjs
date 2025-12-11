// eslint.config.mjs

import {defineConfig, globalIgnores} from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import eslintPrettier from "eslint-config-prettier"; // 1. Prettier連携
import reactHooksPlugin from "eslint-plugin-react-hooks"; // 3. React Hooks
import importPlugin from "eslint-plugin-import"; // 4. Import整理

const eslintConfig = defineConfig([
    // Next.jsとTypeScriptの基本設定
    ...nextVitals,
    ...nextTs,

    // 3. React Hooks のルールを適用
    {
        files: ["**/*.ts", "**/*.tsx"],
        plugins: {
            "react-hooks": reactHooksPlugin,
        },
        rules: {
            "react-hooks/rules-of-hooks": "error",
            "react-hooks/exhaustive-deps": "warn",
        },
    },

    // 4. Import の整理ルールを適用
    {
        files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
        plugins: {
            import: importPlugin,
        },
        rules: {
            "import/order": [
                "error",
                {
                    groups: [
                        "builtin",
                        "external",
                        "internal",
                        "parent",
                        "sibling",
                        "index",
                        "object",
                        "type",
                    ],
                    "newlines-between": "always",
                    alphabetize: {
                        order: "asc",
                        caseInsensitive: true,
                    },
                },
            ],
            // インポート文を含む全ての波括弧 {} の内側にスペースを強制
            "object-curly-spacing": [
                "error",
                "always" // { motion, AnimatePresence } のようにスペースを強制
            ],
            // ... その他の import ルール ...
        },
    },

    // 1. Prettierとの競合回避（全てのルールの**最後に**配置）
    eslintPrettier,

    // Override default ignores of eslint-config-next.
    globalIgnores([
        // Default ignores of eslint-config-next:
        ".next/**",
        "out/**",
        "build/**",
        "next-env.d.ts",
    ]),
]);

export default eslintConfig;