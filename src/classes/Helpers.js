export default class Helpers {

    static strEqual(str1, str2) {
        let lcStr1 = this.simpleStr(str1);
        if (!lcStr1) {
            lcStr1 = this.toLower(str1);
        }

        let lcStr2 = this.simpleStr(str2);
        if (!lcStr2) {
            lcStr2 = this.toLower(str2);
        }

        if (lcStr1 !== lcStr2) {
            if (this.calculateLevenshteinSimilarity(lcStr1, lcStr2) < 88) {
                if (this.calculateStringSimilarity(lcStr1, lcStr2) < 95) {
                    if (this.calculateCosineSimilarity(lcStr1, lcStr2) < 96) {
                        return false;
                    }
                }
            }
        }

        return true;
    }

    static toLower(str) {
        return String(str).trim().toLocaleLowerCase();
    }

    static simpleStr(str) {
        return this.toLower(str)
            .replaceAll('feat. ', 'feat')
            .replaceAll('ft. ', 'feat')
            .replaceAll('&', '')
            .replaceAll('Ø', 'o')
            .replaceAll('#', '')
            .replaceAll('(', '')
            .replaceAll(')', '')
            .replaceAll('%', '')
            .replaceAll('\'', '')
            .replaceAll('`', '')
            .replaceAll('"', '')
            .replaceAll('/', '')
            .replaceAll(',', '')
            .replaceAll('.', '')
            .replaceAll(' ', '')
            .replaceAll('-', '')
            .replaceAll('_', '');
    }

    static calculateStringSimilarity(str1, str2) {
        const set1 = new Set(str1);
        const set2 = new Set(str2);

        const intersection = new Set([...set1].filter(char => set2.has(char)));
        const union = new Set([...set1, ...set2]);

        return (intersection.size / union.size) * 100;
    }

    static calculateLevenshteinSimilarity(str1, str2) {
        const matrix = [];
        for (let i = 0; i <= str1.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= str2.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= str1.length; i++) {
            for (let j = 1; j <= str2.length; j++) {
                const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j - 1] + cost
                );
            }
        }

        const distance = matrix[str1.length][str2.length];
        const maxLength = Math.max(str1.length, str2.length);
        return ((maxLength - distance) / maxLength) * 100;
    }

    static calculateCosineSimilarity(str1, str2) {
        const tokenize = str => str.toLowerCase().split(/\W+/).filter(token => token.length > 0);

        const tokenizeStr1 = tokenize(str1);
        const tokenizeStr2 = tokenize(str2);

        const allTokens = new Set([...tokenizeStr1, ...tokenizeStr2]);

        const vector1 = Array.from(allTokens).map(token =>
            tokenizeStr1.includes(token) ? 1 : 0
        );
        const vector2 = Array.from(allTokens).map(token =>
            tokenizeStr2.includes(token) ? 1 : 0
        );

        let dotProduct = 0;
        let magnitude1 = 0;
        let magnitude2 = 0;

        for (let i = 0; i < allTokens.size; i++) {
            dotProduct += vector1[i] * vector2[i];
            magnitude1 += vector1[i] * vector1[i];
            magnitude2 += vector2[i] * vector2[i];
        }

        return dotProduct / (Math.sqrt(magnitude1) * Math.sqrt(magnitude2)) * 100;
    }
}
