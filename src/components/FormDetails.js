import React, { Component } from 'react';
import PropTypes from 'prop-types';
import _ from 'lodash';
import produce from "immer";
import uuidv4 from 'uuid/v4';

import FormGroup from "./FormGroup";
import UpdateForm from "./UpdateForm";
import FieldsPanel from "./FieldsPanel";

import config from '../config';
import handleErrors from '../lib/handleErrors';
import { FormElementContract, FormElementGroupContract } from '../contracts';

const formElementDisplayOrder = (group) => {
  let displayOrder = 1;
  if (group.formElements && group.formElements.length) {
    displayOrder = _.last(group.formElements).displayOrder + 1
  }
  return displayOrder;
}

const groupDisplayOrder = (form) => {
  let displayOrder = 1;
  if (form.formElementGroups && form.formElementGroups.length) {
    displayOrder = _.last(form.formElementGroups).displayOrder + 1
  }
  return displayOrder;
}

class FormDetails extends Component {

  constructor(props) {
    super(props);

    this.state = { form: {}, showFields: true, currentGroup: {} };

    this.onSelectField = this.onSelectField.bind(this);
    this.addGroupField = this.addGroupField.bind(this);
  }

  componentDidMount() {
    return fetch(`/forms/export?formUUID=${this.props.match.params.formUUID}`, {
      credentials: 'include',
      Accept: 'application/json',
      headers: { "ORGANISATION-NAME": config.orgName }
    })
      .then((response) => {
        if (response.status >= 200 && response.status < 300) {
          return response.json();
        } else if (response.status === 401 || response.status === 403) {
          window.location.pathname = '/';
          return null;
        }
        const error = new Error(response.statusText);
        error.response = response;
        throw error;
      })
      .then((form) => {
        _.forEach(form.formElementGroups, (group) => {
          group.groupId = (group.groupId || group.name).replace(/[^a-zA-Z0-9]/g, "_");
          group.collapse = true;
          group.formElements.forEach(fe => fe.collapse = true);
        });
        this.setState({ form: form });
        localStorage.setItem("currentForm", JSON.stringify(form));
      })
      .catch((error) => {
        console.log(error);
      });
  }

  renderForm() {
    return (
      <div className="col-9">
        <form>
          {this.renderGroups()}
          <button type="button" className="btn btn-success pull-right"
            onClick={() => {
              this.saveForm();
              this.props.history.push("/forms");
            }}>
            <i className={`glyphicon glyphicon-save`} />
            Save your form
                    </button>
        </form>
      </div>);
  }

  saveForm() {

    const formToBeSaved = produce(this.state.form, draftState => {
      for (const group of draftState.formElementGroups) {
        group.formElements = _.filter(group.formElements, e => e.name !== "" && e.concept.dataType !== "");
      }
    });

    // form.name = "Mother Enrolment New";
    // alert(JSON.stringify(form));
    fetch("/forms", {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'ORGANISATION-NAME': config.orgName
      },
      body: JSON.stringify(formToBeSaved),
    })
      .then(handleErrors)
      .catch(err => {
        alert(err);
      });
  }

  onSelectField(field, groupId) {
    let currentGroup;

    this.setState(
      produce(draft => {
        //collapse all form elements and groups while adding a new field
        draft.form.formElementGroups.forEach(feg => {
          feg.collapse = true;
          feg.formElements.forEach(fe => fe.collapse = true);
        });

        if (field === 'Group') {
          const newGroupId = "group_" + (draft.form.formElementGroups.length + 1);
          currentGroup = new FormElementGroupContract(
            uuidv4(),
            newGroupId,
            "",
            groupDisplayOrder(draft.form),
            "",
            [],
            false
          );
          draft.form.formElementGroups.push(currentGroup);
          draft.showFields = true;
        } else {
          const group = _.find(draft.form.formElementGroups, (g) => {
            return g.groupId === groupId;
          });
          const formElements = group.formElements;
          const newElement = new FormElementContract(
            uuidv4(),
            "",
            formElementDisplayOrder(group),
            { dataType: "", name: "" },
            [],
            false
          );

          formElements.push(newElement);
          draft.showFields = false;
        }

        localStorage.setItem("currentForm", JSON.stringify(draft.form));
      })
    );
  }

  handleKeyValuesChange = (key, value, checked, field) => {
    this.setState(
      produce(draft => {
        for (const group of draft.form.formElementGroups) {
          for (const element of group.formElements) {
            if (element.uuid === field.uuid) {
              if (key === "duration") {
                let foundMatchingKeyValue = false;
                for (const keyValue of element.keyValues) {
                  if (keyValue.key === key) {
                    foundMatchingKeyValue = true;
                    if (checked) {
                      keyValue.value.push(value);
                      keyValue.value = _.uniq(keyValue.value);
                    } else {
                      keyValue.value = keyValue.value.filter(v => v !== value);
                    }
                    break;
                  }
                }
                if (!foundMatchingKeyValue) {
                  element.keyValues.push({
                    "key": key,
                    "value": checked ? [value] : []
                  });
                }
              } else if (key === "editable") {
                let foundMatchingKeyValue = false;
                for (const keyValue of element.keyValues) {
                  if (keyValue.key === key) {
                    foundMatchingKeyValue = true;
                    keyValue.value = checked;
                    break;
                  }
                }
                if (!foundMatchingKeyValue) {
                  element.keyValues.push({ "key": key, "value": checked });
                }
              } else if (key === "ExcludedAnswers") {
                let foundMatchingKeyValue = false;
                for (const keyValue of element.keyValues) {
                  if (keyValue.key === key) {
                    foundMatchingKeyValue = true;
                    keyValue.value = _.uniq(value);
                    break;
                  }
                }
                if (!foundMatchingKeyValue) {
                  element.keyValues.push({ "key": key, "value": _.uniq(value) });
                }
              }
            }
          }
        }
        localStorage.setItem("currentForm", JSON.stringify(draft.form));
      })
    );
  }

  handleFieldChange = (name, value, fieldUuid) => {
    this.setState(
      produce(draft => {
        for (const group of draft.form.formElementGroups) {
          for (const element of group.formElements) {
            if (element.uuid === fieldUuid) {
              element[name] = value;
              break;
            }
          }
        }

        localStorage.setItem("currentForm", JSON.stringify(draft.form));
      })
    );

  }

  handleGroupChange = (name, value, groupUuid) => {
    this.setState(
      produce(draft => {
        for (const group of draft.form.formElementGroups) {
          if (group.uuid === groupUuid) {
            group[name] = value;
            break;
          }
        }

        localStorage.setItem("currentForm", JSON.stringify(draft.form))
      })
    );
  }

  /**
   * single group, no fields added show the fields panel
   * single group, selected a field, add field component and 'Add field' button. Except last field, all other fields
   * are collapsed.
   * single group, click on 'Add field'. Collapse all field, show fields panel
   * click on group in fields panel, a new group should be added, all other group fields collapsed. just the new group
   * will have the fields panel
   * @returns {Array}
   */
  renderGroups() {
    const formElements = [];
    let i = 0;
    _.forEach(this.state.form.formElementGroups, (group) => {
      const subElements = [];
      const isCurrentGroup = (this.state.currentGroup &&
        group.groupId === this.state.currentGroup.groupId) || false;
      subElements.push(
        <FormGroup group={group}
          fields={group.formElements} key={group.groupId + i++}
          handleFieldChange={this.handleFieldChange}
          handleGroupChange={this.handleGroupChange}
          handleKeyValuesChange={this.handleKeyValuesChange}
          collapse={this.state.showFields || !isCurrentGroup} />
      );
      if (this.state.showFields && isCurrentGroup) {
        subElements.push(this.showFields(group));
      } else {
        subElements.push(
          <button type="button" className="btn btn-secondary btn-block"
            onClick={() => (this.addGroupField(group))} key={group.groupId + "_bt"}>
            Add a field
          </button>);
      }

      formElements.push(<div key={group.groupId + "_border"} className="border border-secondary rounded mb-4">{subElements}</div>);
    });
    return formElements;
  }

  componentDidUpdate() {
    if (this.state.anchor) {
      this.refs[this.state.anchor].scrollIntoView();
      delete this.state.anchor;
    }
  }

  addGroupField(currentGroup) {
    // return;
    this.setState({ currentGroup, showFields: true, anchor: currentGroup.groupId + "_FieldsPanel" });
  }

  showFields(group) {
    return <div ref={group.groupId + "_FieldsPanel"} key={group.groupId + "_FieldsPanel"}>
      <FieldsPanel onClick={this.onSelectField.bind(this)} groupId={group.groupId} groupName={group.name} />
    </div>;
  }

  render() {
    return (
      <div className="row">
        {this.renderForm()}
        <div className="col-3">
          <UpdateForm form={this.state.form} />
        </div>
      </div>
    );
  }
}

FormDetails.defaultProps = {
  formGroups: [createGroup('group_1')]
};

FormDetails.propTypes = {
  formGroups: PropTypes.array,
  currentGroup: PropTypes.object,
  showFields: PropTypes.bool
};

function createGroup(id) {
  return { groupId: id, name: '', display: '', formElements: [] }
}

export default FormDetails;