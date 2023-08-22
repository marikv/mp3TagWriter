export default class Helpers {

    static simpleStr(str) {
        return String(str)
            .trim()
            .toLocaleLowerCase()
            .toLowerCase()
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

    static strEqual(str1, str2) {
        return this.simpleStr(str1) === this.simpleStr(str2);
    }
}
