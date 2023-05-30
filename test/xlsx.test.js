/* eslint-disable no-undef */

'strict';

// ./test/xlsx.test.js
// Unit Tests for excel read write operations
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { expect } = require('chai');
// const sinon = require('sinon');
const fs = require('fs');
const readExcelData = require('../admin/services/xlsx');

chai.use(chaiAsPromised);

describe('Read excel files', () => {
    const buffer = fs.readFileSync(
        '/Users/ian/Documents/Projects/nap/test/assets/Lists.xlsx'
    );

    console.log(buffer);

    console.log(__dirname);

    it('should return an array of rows read from the data file with a created_by field', async () => {
        const expectedDto = [
            {
                company_id: 'WEG',
                company: 'Waters Edge Group, Inc',
                description:
                    'WEG construction. Performs all vertical construction for WEG Capital',
                tax_id: '11-1005559',
                active: true,
                address_1: '225 Zeblin RD NE',
                address_2: undefined,
                city: 'Atlanta',
                region: 'GA',
                postal_code: 30342,
                country: 'USA',
                created_by: 'nap-admin',
            },
            {
                company_id: 'WEC',
                company: 'Waters Edge Capital, Inc',
                description:
                    'WEG holding.  Holds assets related to construction projects',
                tax_id: '11-1005555',
                active: true,
                address_1: '225 Zeblin RD NE',
                address_2: undefined,
                city: 'Atlanta',
                region: 'GA',
                postal_code: 30342,
                country: 'USA',
                created_by: 'nap-admin',
            },
            {
                company_id: '010',
                company: 'WEG Heritage, LLC',
                description: 'Heritage Heights project',
                tax_id: '22-2220000',
                active: true,
                address_1: '45 Heritage Lane',
                address_2: 'Phase I',
                city: 'Atlanta',
                region: 'GA',
                postal_code: 30328,
                country: 'USA',
                created_by: 'nap-admin',
            },
        ];

        const actualDtoPromise = readExcelData(0, buffer, 'nap-admin');
        await expect(actualDtoPromise).to.eventually.deep.equal(expectedDto);
    });

    it('should throw an error if file is buffer is null', async () => {
        await expect(readExcelData(0, null, 'nap-admin')).to.be.rejectedWith(
            'Input type unknown.'
        );
    });
});
