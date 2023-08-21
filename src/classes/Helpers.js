export default class Helpers {

    static simpleStr(str) {
        return String(str)
            .trim()
            .toLocaleLowerCase()
            .toLowerCase()
            .replaceAll('  ', ' ')
            .replaceAll('__', '_');
    }

    static strEqual(str1, str2) {
        return this.simpleStr(str1) === this.simpleStr(str2);
    }
}
