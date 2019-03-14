function createNewDashboard(dashboardName) {
  cy.visit('/dashboards');
  cy.getByTestId('CreateButton').click();
  cy.get('li[role="menuitem"]')
    .contains('Dashboard')
    .click();

  cy.server();
  cy.route('POST', 'api/dashboards').as('NewDashboard');

  cy.getByTestId('EditDashboardDialog').within(() => {
    cy.getByTestId('DashboardSaveButton').should('be.disabled');
    cy.get('input').type(dashboardName);
    cy.getByTestId('DashboardSaveButton').click();
  });

  return cy.wait('@NewDashboard').then((xhr) => {
    const slug = Cypress._.get(xhr, 'response.body.slug');
    assert.isDefined(slug, 'Dashboard api call returns slug');
    return slug;
  });
}

function archiveCurrentDashboard() {
  cy.getByTestId('DashboardMoreMenu')
    .click()
    .within(() => {
      cy.get('li')
        .contains('Archive')
        .click();
    });

  cy.get('.btn-warning')
    .contains('Archive')
    .click();
  cy.get('.label-tag-archived').should('exist');
}

function addTextbox() {
  cy.contains('a', 'Add Textbox').click();
  cy.get('.add-textbox').within(() => {
    cy.get('textarea').type('Hello world!');
  });
  cy.contains('button', 'Add to Dashboard').click();
}

function addWidget(queryData) {
  const defaultQueryData = { data_source_id: 1, options: { parameters: [] }, schedule: null };
  const merged = Object.assign(defaultQueryData, queryData);

  cy.server();

  // create query
  return cy.request('POST', '/api/queries', merged)
    .then(({ body }) => {
      // publish it so it's avail for widget
      return cy.request('POST', `/api/queries/${body.id}`, { is_draft: false });
    })
    .then(({ body }) => {
      // create widget
      cy.contains('a', 'Add Widget').click();
      cy.getByTestId('AddWidgetDialog').within(() => {
        cy.get(`.query-selector-result[data-test="QueryId${body.id}"]`).click();
      });

      cy.route('POST', 'api/widgets').as('NewWidget');
      cy.contains('button', 'Add to Dashboard').click();
      return cy.wait('@NewWidget');
    })
    .then((xhr) => {
      const body = Cypress._.get(xhr, 'response.body');
      assert.isDefined(body, 'Widget api call returns body');
      return body;
    });
}

describe('Dashboard', () => {
  beforeEach(() => {
    cy.login();
  });

  it('creates a new dashboard and archives it', () => {
    createNewDashboard('Foo Bar').then((slug) => {
      cy.visit('/dashboards');
      cy.getByTestId('DashboardLayoutContent').within(() => {
        cy.getByTestId(slug).should('exist').click();
      });

      archiveCurrentDashboard();

      cy.visit('/dashboards');
      cy.getByTestId('DashboardLayoutContent').within(() => {
        cy.getByTestId(slug).should('not.exist');
      });
    });
  });

  describe('Textbox and Widget', () => {
    beforeEach(() => {
      createNewDashboard('Foo Bar');
      cy.contains('button', 'Apply Changes').click();
      cy.getByTestId('DashboardMoreMenu')
        .click()
        .within(() => {
          cy.get('li')
            .contains('Edit')
            .click();
        });
    });

    it('adds and removes textbox (from button)', () => {
      addTextbox();

      cy.get('.widget-text').within(() => {
        cy.get('.widget-menu-remove').click();
      });

      cy.get('.widget-text').should('not.exist');
    });

    it('adds and removes textbox (from menu)', () => {
      addTextbox();
      cy.contains('button', 'Apply Changes').click();

      cy.get('.widget-text').within(() => {
        cy.get('.widget-menu-regular').click({ force: true }).within(() => {
          cy.get('li a').contains('Remove From Dashboard').click({ force: true });
        });
      });

      cy.get('.widget-text').should('not.exist');
    });

    it('adds, opens edit dialog and removes textbox', () => {
      addTextbox();
      cy.contains('button', 'Apply Changes').click();

      cy.get('.widget-text').within(() => {
        cy.get('.widget-menu-regular').click({ force: true }).within(() => {
          cy.get('li a').contains('Edit').click({ force: true });
        });
      });

      const newContent = '[edited]';
      cy.get('edit-text-box').should('exist').within(() => {
        cy.get('textarea').clear().type(newContent);
        cy.contains('button', 'Save').click();
      });

      cy.get('.widget-text')
        .should('contain', newContent)
        .within(() => {
          cy.get('.widget-menu-regular').click({ force: true }).within(() => {
            cy.get('li a').contains('Remove From Dashboard').click({ force: true });
          });
        });
    });

    it('adds and removes widget', () => {
      const queryData = {
        name: 'Test Query 01',
        query: 'select 1',
      };

      addWidget(queryData).then(({ id }) => {
        cy.getByTestId(`WidgetId${id}`).should('exist').within(() => {
          cy.get('.widget-menu-remove').click();
        });
        cy.getByTestId(`WidgetId${id}`).should('not.exist');
      });
    });

    it('renders widget auto height by table row count', () => {
      const testAutoHeight = (rowCount, expectedWidgetHeight) => {
        const queryData = {
          name: 'Test Query Auto Height',
          query: `select s.a FROM generate_series(1,${rowCount}) AS s(a)`,
        };

        addWidget(queryData).then(({ id, options }) => {
          expect(options.position.autoHeight).to.be.true;
          cy.getByTestId(`WidgetId${id}`)
            .its('0.offsetHeight')
            .should('eq', expectedWidgetHeight);
        });
      }

      testAutoHeight(2, 235);
      testAutoHeight(5, 335);
    });
  });
});
